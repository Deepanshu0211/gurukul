-- One reporting rule for saved and new attendance; no marks or students are rewritten.
-- Activate only after the updated Android app is in use; old APKs do not understand the new keys.
begin;
-- The same academic-to-attendance mapping is used for every date.
create or replace function public.attendance_class_key(p_grade int,p_section text)
returns text language sql immutable set search_path=public as $$
 select case when upper(trim(p_section))='VEDIC' then '*|VEDIC' else p_grade||'|*' end
$$;
revoke all on function public.attendance_class_key(int,text) from public,anon;
grant execute on function public.attendance_class_key(int,text) to authenticated,service_role;
alter table public.duties add column if not exists exclude_vedic boolean not null default false;
alter table public.duties add column if not exists pilot_window boolean not null default false;

create or replace function public.attendance_group_contains(d public.duties, s public.students)
returns boolean language sql stable set search_path=public as $$
 select s.active
 and (d.scope is distinct from 'res' or s.stype <> 'Day Scholar')
 and (not d.exclude_vedic or upper(trim(s.section)) <> 'VEDIC')
 and case
  when d.class_key='*|VEDIC' then upper(trim(s.section))='VEDIC'
  when d.class_key ~ '^[0-9]+\|\*$' then s.grade=split_part(d.class_key,'|',1)::int
  when d.class_key is not null then s.grade||'|'||s.section=d.class_key
  else (d.band is null or (d.band='Primary' and s.grade between 2 and 5)
   or (d.band='Middle' and s.grade between 6 and 8) or (d.band='Senior' and s.grade between 9 and 12))
   and (d.house is null or s.house=d.house)
 end
$$;
revoke all on function public.attendance_group_contains(public.duties,public.students) from public,anon;
grant execute on function public.attendance_group_contains(public.duties,public.students) to authenticated,service_role;

-- Partitioned registers must reject non-members and incomplete submissions.
create or replace function public.guard_vedic_attendance() returns trigger
language plpgsql security definer set search_path=public as $$
declare d duties;
begin
 select * into d from duties where id=new.duty_id;
 if (d.exclude_vedic or d.class_key='*|VEDIC')
 and not exists(select 1 from students s where s.admission_no=new.admission_no and attendance_group_contains(d,s)) then
  raise exception 'Student is outside this attendance group' using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists attendance_vedic_membership on public.attendance;
create trigger attendance_vedic_membership before insert or update on public.attendance
for each row execute function public.guard_vedic_attendance();

create or replace function public.guard_vedic_register() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if old.state='submitted' and (new.exclude_vedic,new.class_key) is distinct from (old.exclude_vedic,old.class_key) then
  raise exception 'Cannot change grouping on submitted attendance' using errcode='22023';
 end if;
 if (old.exclude_vedic or new.exclude_vedic or old.class_key='*|VEDIC' or new.class_key='*|VEDIC') and
  (new.exclude_vedic,new.class_key) is distinct from (old.exclude_vedic,old.class_key)
  and auth.uid() is not null and coalesce(my_role(),'') not in ('admin','coordinator') then
  raise exception 'Only coordinator/admin can change attendance groups' using errcode='42501';
 end if;
 if old.state='pending' and new.state='submitted' and
  (new.exclude_vedic or new.class_key='*|VEDIC') and
  exists(select 1 from students s where attendance_group_contains(new,s) and not exists(
   select 1 from attendance a where a.duty_id=new.id and a.admission_no=s.admission_no)) then
  raise exception 'Include every student in this attendance group' using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists duties_vedic_complete on public.duties;
create trigger duties_vedic_complete before update on public.duties
for each row execute function public.guard_vedic_register();

-- Current categories applied to all dates, using the original saved submissions.
create or replace function public.class_status_board(p_day date default current_date,p_checkpoint text default 'morning')
returns table(grade int,section text,class_key text,class_label text,teacher text,
 res bigint,day_scholars bigint,strength bigint,res_present bigint,day_present bigint,
 res_absent bigint,day_absent bigint,sick bigint,not_reported bigint,on_duty bigint,
 unmarked bigint,submitted boolean,submitted_at timestamptz)
language sql stable security invoker set search_path=public as $$
 with roster as (
  select distinct s.admission_no,s.stype,
   case when upper(trim(s.section))='VEDIC' then null::int else s.grade end as g,
   attendance_class_key(s.grade,s.section) as k
  from students s where exists(select 1 from duties d where d.day=p_day and d.checkpoint_id=p_checkpoint
   and attendance_group_contains(d,s))
 ), marks as (
  select distinct on (a.admission_no) a.admission_no,a.status
  from attendance a join duties d on d.id=a.duty_id
  where d.day=p_day and d.checkpoint_id=p_checkpoint and d.state='submitted' order by a.admission_no,d.submitted_at desc nulls last,d.id
 ), groups as (
  select r.g,r.k,count(*) filter(where r.stype<>'Day Scholar') as res,
   count(*) filter(where r.stype='Day Scholar') as ds,count(*) as strength,
   count(*) filter(where m.admission_no is not null and (m.status is null or m.status in ('V','Y')) and r.stype<>'Day Scholar') as rp,
   count(*) filter(where m.admission_no is not null and (m.status is null or m.status in ('V','Y')) and r.stype='Day Scholar') as dp,
   count(*) filter(where m.status='A' and r.stype<>'Day Scholar') as ra,
   count(*) filter(where m.status='A' and r.stype='Day Scholar') as da,
   count(*) filter(where m.status='S') as sick,count(*) filter(where m.status in ('H','G','O')) as nr,
   count(*) filter(where m.status in ('V','Y')) as od,count(*) filter(where m.admission_no is null) as unmarked
  from roster r left join marks m on m.admission_no=r.admission_no group by r.g,r.k
 )
 select g.g,case when g.k='*|VEDIC' then 'VEDIC' else '*' end,g.k,
  case when g.k='*|VEDIC' then 'Vedic' else 'Class '||g.g end,
  teacher.name,g.res,g.ds,g.strength,g.rp,g.dp,g.ra,g.da,g.sick,g.nr,g.od,g.unmarked,
  coalesce(state.done,false),state.at
 from groups g
 left join lateral(select string_agg(distinct s.name,' / ' order by s.name) as name
  from duties d join staff s on s.id=d.staff_id where d.day=p_day and d.checkpoint_id=p_checkpoint
   and exists(select 1 from students s2 join roster r on r.admission_no=s2.admission_no
    where r.k=g.k and attendance_group_contains(d,s2))) teacher on true
 left join lateral(select bool_and(d.state='submitted') as done,max(d.submitted_at) as at
  from duties d where d.day=p_day and d.checkpoint_id=p_checkpoint and exists(
   select 1 from students s join roster r on r.admission_no=s.admission_no
   where r.k=g.k and attendance_group_contains(d,s))) state on true
 order by g.g nulls last
$$;
revoke all on function public.class_status_board(date,text) from public,anon;
grant execute on function public.class_status_board(date,text) to authenticated,service_role;

create or replace view public.attendance_report_groups with (security_invoker=true) as
 select ad.day,ad.checkpoint_id,ad.checkpoint,ad.start_min,
  case when attendance_class_key(ad.grade,ad.section)='*|VEDIC'
   then 'vedic-record:'||ad.day||':'||ad.checkpoint_id else ad.duty_id end as duty_id,
  case when attendance_class_key(ad.grade,ad.section)='*|VEDIC' then 'Vedic' else ad.group_label end as group_label,
  count(*) as strength,count(*) filter(where ad.present) as present,
  count(*) filter(where ad.status='A') as absent,
  count(*) filter(where not ad.present and ad.status<>'A') as elsewhere,
  string_agg(distinct st.name,' / ' order by st.name) as taken_by,
  max(ad.submitted_at) as submitted_at,
  array_agg(distinct ad.submitted_at order by ad.submitted_at)
   filter(where ad.submitted_at is not null) as submitted_times
 from attendance_detail ad left join staff st on st.id=ad.submitted_by
 group by ad.day,ad.checkpoint_id,ad.checkpoint,ad.start_min,
  case when attendance_class_key(ad.grade,ad.section)='*|VEDIC'
   then 'vedic-record:'||ad.day||':'||ad.checkpoint_id else ad.duty_id end,
  case when attendance_class_key(ad.grade,ad.section)='*|VEDIC' then 'Vedic' else ad.group_label end;
revoke all on public.attendance_report_groups from public,anon;
grant select on public.attendance_report_groups to authenticated,service_role;

-- Retain the existing RPC signature for installed clients; it reads the same view.
create or replace function public.attendance_headcount(p_from date default current_date,p_to date default current_date)
returns table(day date,duty_id text,checkpoint text,start_min int,group_label text,
 strength bigint,present bigint,absent bigint,elsewhere bigint)
language sql stable security invoker set search_path=public as $$
 select r.day,r.duty_id,r.checkpoint,r.start_min,r.group_label,r.strength,r.present,r.absent,r.elsewhere
 from attendance_report_groups r where r.day between p_from and p_to
 order by r.day,r.start_min,r.group_label
$$;

commit;
