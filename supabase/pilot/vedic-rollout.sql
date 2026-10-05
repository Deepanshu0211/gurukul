-- Requires 035 and vedic-guards.sql. This file alone does not activate a rollout.
-- Call activate_vedic_attendance(start_date, staff_id) only after approval and APK rollout.
begin;
create or replace function public.partition_vedic_day(p_day date,p_teacher text) returns int
language plpgsql security definer set search_path=public as $$
declare cp record; n int;
begin
 if auth.uid() is not null and coalesce(my_role(),'') not in ('admin','coordinator') then
  raise exception 'Only coordinator/admin can change attendance groups' using errcode='42501';
 end if;
 if p_day<school_today() then raise exception 'Past attendance cannot be regrouped'; end if;
 if not exists(select 1 from staff where id=p_teacher and active and role='teacher') then
  raise exception 'Choose an active Vedic teacher'; end if;
 -- Concurrent submissions cannot race this membership change.
 perform 1 from duties where day=p_day for update;
 if exists(select 1 from duties d where d.day=p_day and
  (d.state<>'pending' or exists(select 1 from attendance a where a.duty_id=d.id))) then
  raise exception 'Day has saved attendance; grouping was not changed'; end if;
 if exists(select 1 from duties where day=p_day and upper(split_part(class_key,'|',2))='VEDIC'
  and class_key<>'*|VEDIC') then
  raise exception 'Existing Vedic section duties need a reviewed consolidation plan'; end if;
 for cp in select checkpoint_id,
   case when bool_and(coalesce(scope='res',false)) then 'res' else 'all' end as eligibility,
   bool_or(pilot_window) as timed
   from duties where day=p_day and class_key is distinct from '*|VEDIC' group by checkpoint_id
 loop
  update duties set exclude_vedic=true
   where day=p_day and checkpoint_id=cp.checkpoint_id and class_key is distinct from '*|VEDIC'
    and not exclude_vedic;
  if exists(select 1 from students where active and upper(trim(section))='VEDIC'
    and (cp.eligibility<>'res' or stype<>'Day Scholar')) then
   insert into duties(id,checkpoint_id,day,group_label,class_key,scope,staff_id,pilot_window)
   select 'vedic-'||cp.checkpoint_id||'-'||to_char(p_day,'YYYYMMDD'),cp.checkpoint_id,p_day,
    'Vedic','*|VEDIC',cp.eligibility,p_teacher,cp.timed
   where not exists(select 1 from duties where day=p_day and checkpoint_id=cp.checkpoint_id and class_key='*|VEDIC');
  end if;
 end loop;
 select count(*) into n from duties where day=p_day; return n;
end $$;
revoke all on function public.partition_vedic_day(date,text) from public,anon;
grant execute on function public.partition_vedic_day(date,text) to authenticated,service_role;

-- Update the generator in place; existing IDs remain unchanged.
CREATE OR REPLACE FUNCTION public.generate_duties(p_day date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d date:=coalesce(p_day,school_today()); n int; vedic_from date; vedic_teacher text;
begin
 if auth.uid() is not null and coalesce(my_role(),'') not in ('coordinator','admin') then
  raise exception 'Only coordinator/admin can generate registers' using errcode='42501';
 end if;
 if d < (select value::date from app_env where key='trial_start')
 or d > (select value::date from app_env where key='trial_end') then return 0; end if;
 if exists(select 1 from holidays where day=d and not hostel_checkpoints) then return 0; end if;
 insert into duties(id,checkpoint_id,day,group_label,class_key,scope,staff_id,pilot_window)
 select 'physical-'||replace(k.class_key,'|','-')||'-'||to_char(d,'YYYYMMDD'),
 'morning',d,'Class '||replace(replace(k.class_key,'|*',''),'|',' '),k.class_key,'res',a.staff_id,true
 from (select distinct grade||'|'||case when
  (select value from app_env where key='attendance_mode')='grade' then '*' else section end as class_key
  from students where active and stype='Residential') k
 join pilot_class_assignments a on a.class_key=k.class_key
 -- Class names can change; existing register IDs and attendance stay stable.
 where not exists(select 1 from duties existing where existing.day=d
  and existing.checkpoint_id='morning' and existing.class_key=k.class_key)
 on conflict(id) do nothing;
 select value::date into vedic_from from app_env where key='vedic_attendance_from';
 select value into vedic_teacher from app_env where key='vedic_attendance_teacher';
 if vedic_from is not null and d>=vedic_from and
  not exists(select 1 from duties where day=d and state='submitted') then
  perform partition_vedic_day(d,vedic_teacher);
 end if;
 select count(*) into n from duties where day=d and checkpoint_id='morning';
 return n;
end $function$
;
revoke all on function public.generate_duties(date) from public,anon;
grant execute on function public.generate_duties(date) to authenticated,service_role;

create or replace function public.activate_vedic_attendance(p_start date,p_teacher text) returns int
language plpgsql security definer set search_path=public as $$
declare target date; total int:=0;
begin
 if auth.uid() is not null and coalesce(my_role(),'') not in ('admin','coordinator') then
  raise exception 'Only coordinator/admin can activate grouping'; end if;
 if p_start<=school_today() then raise exception 'Start must be a future day; keep current attendance unchanged'; end if;
 if not exists(select 1 from staff where id=p_teacher and active and role='teacher') then
  raise exception 'Choose an active Vedic teacher'; end if;
 if (select value from app_env where key='environment') is distinct from 'school-pilot' then
  raise exception 'Reviewed pilot activation only'; end if;
 if exists(select 1 from staff where id=p_teacher and class_key is not null and class_key<>'*|VEDIC') then
  raise exception 'Vedic teacher already has another academic class; review the assignment first'; end if;
 update staff set class_key='*|VEDIC' where id=p_teacher and class_key is distinct from '*|VEDIC';
 insert into app_env(key,value) values('vedic_attendance_from',p_start::text),('vedic_attendance_teacher',p_teacher)
 on conflict(key) do update set value=excluded.value;
 -- The first activation partitions existing future pending duties; their IDs and owners stay unchanged.
 for target in select distinct day from duties where day>=p_start order by day loop
  total:=total+partition_vedic_day(target,p_teacher);
 end loop;
 return total;
end $$;
revoke all on function public.activate_vedic_attendance(date,text) from public,anon;
grant execute on function public.activate_vedic_attendance(date,text) to authenticated,service_role;

-- One health check follows the stored membership of today's registers.
create or replace function public.duty_health()
returns table(day date,duties int,classes int,morning_duties int,unrostered int,healthy boolean)
language sql stable security definer set search_path=public as $$
 with today as (select school_today() as day), current_duties as (
  select d.* from public.duties d,today t where d.day=t.day and d.checkpoint_id='morning'
 ), eligible as (select * from students where active and stype='Residential'), coverage as (
  select s.admission_no,count(d.id) as registers from eligible s
  left join current_duties d on attendance_group_contains(d,s) group by s.admission_no
 )
 select t.day,(select count(*)::int from public.duties d where d.day=t.day),
  (select count(distinct d.class_key)::int from current_duties d),
  (select count(*)::int from current_duties),
  (select count(*)::int from public.duties d left join staff s on s.id=d.staff_id
   where d.day=t.day and (s.id is null or not s.active)),
  (t.day<(select value::date from app_env where key='trial_start')
   or t.day>(select value::date from app_env where key='trial_end')
   or (exists(select 1 from current_duties)
    and not exists(select 1 from coverage where registers<>1)
    and not exists(select 1 from current_duties d left join staff s on s.id=d.staff_id
     where not d.pilot_window or d.scope is distinct from 'res' or s.id is null or not s.active)))
 from today t
$$;
revoke all on function public.duty_health() from public;
grant execute on function public.duty_health() to anon,authenticated,service_role;
commit;
