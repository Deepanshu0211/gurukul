-- School pilot only: class registers for residential Physical Activity.
-- Full supporting schema 001..034 is applied by the private reviewed runner.
do $$ begin
 if not exists(select 1 from app_env where key='environment' and value='school-pilot') then
  raise exception 'School-pilot environment required';
 end if;
end $$;
alter table duties add column if not exists pilot_window boolean not null default false;
insert into app_env(key,value) values
 ('trial_start','2026-10-03'),('trial_end','2026-11-02'),('attendance_scope','residential'),('attendance_mode','class')
on conflict(key) do update set value=excluded.value;
create table if not exists pilot_class_assignments(
 class_key text primary key, staff_id text not null references staff(id)
);
alter table pilot_class_assignments enable row level security;
create policy pilot_assignments_read on pilot_class_assignments for select to authenticated using(my_staff_id() is not null);
create policy pilot_assignments_write on pilot_class_assignments for all to authenticated
 using(my_role() in ('coordinator','admin')) with check(my_role() in ('coordinator','admin'));
insert into status_types(code,label,accounted,spanning) values
 ('A','Absent',false,false),('H','Home',true,true),('S','Sick',true,true),
 ('O','Outing',true,true),('G','Gita Nagari',true,true),('V','Activity',true,false),('Y','Self study',true,false)
on conflict(code) do nothing;
insert into checkpoints(id,name,start_min,end_min) values('morning','Physical Activity',375,1440)
on conflict(id) do update set name=excluded.name,start_min=excluded.start_min,end_min=excluded.end_min;
create or replace function my_staff() returns staff
language sql stable security definer set search_path=public
as $$ select * from staff where auth_user_id=auth.uid() and active $$;
create or replace function my_role() returns text
language sql stable security definer set search_path=public
as $$ select role from staff where auth_user_id=auth.uid() and active $$;
create or replace function my_staff_id() returns text
language sql stable security definer set search_path=public
as $$ select id from staff where auth_user_id=auth.uid() and active $$;
create or replace function my_class_key() returns text
language sql stable security definer set search_path=public
as $$ select class_key from staff where auth_user_id=auth.uid() and active $$;
create or replace function generate_duties(p_day date default null) returns int
language plpgsql security definer set search_path=public as $$
declare d date:=coalesce(p_day,school_today()); n int;
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
 select count(*) into n from duties where day=d and checkpoint_id='morning';
 return n;
end $$;
-- Existing substitute marking stays available. Oversight can correct records.
drop policy if exists duties_update on duties;
create policy duties_update on duties for update to authenticated
using(my_staff_id() is not null and my_role() not in ('nurse','reception') and (state='pending' or can_override()))
with check(my_staff_id() is not null and my_role() not in ('nurse','reception'));
drop policy if exists attendance_insert on attendance;
drop policy if exists attendance_update on attendance;
create policy attendance_insert on attendance for insert to authenticated
with check(my_staff_id() is not null and my_role() not in ('nurse','reception')
 and exists(select 1 from duties d where d.id=duty_id and (d.state='pending' or can_override())));
create policy attendance_update on attendance for update to authenticated
using(my_staff_id() is not null and my_role() not in ('nurse','reception')
 and exists(select 1 from duties d where d.id=duty_id and (d.state='pending' or can_override())))
with check(my_staff_id() is not null and my_role() not in ('nurse','reception')
 and exists(select 1 from duties d where d.id=duty_id and (d.state='pending' or can_override())));
create or replace function guard_pilot_attendance() returns trigger
language plpgsql security definer set search_path=public as $$
declare d duties; clock timestamp:=clock_timestamp() at time zone 'Asia/Kolkata';
begin
 select * into d from duties where id=new.duty_id;
 if d.pilot_window then
  if not exists(select 1 from students s where s.admission_no=new.admission_no
   and s.active and s.stype='Residential'
   and (s.grade||'|'||s.section=d.class_key or s.grade||'|*'=d.class_key)) then
   raise exception 'This student is outside this residential class register' using errcode='22023';
  end if;
  if not (d.state='submitted' and can_override()) and
   (clock < d.day::timestamp+interval '6 hours 15 minutes' or clock >= (d.day+1)::timestamp) then
   raise exception 'Physical Activity opens at 6:15 AM and closes at midnight' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
create trigger attendance_pilot_window before insert or update on attendance
for each row execute function guard_pilot_attendance();
create or replace function guard_pilot_register() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if old.pilot_window then
  if coalesce(my_role(),'') not in ('coordinator','admin') and
   (new.day,new.checkpoint_id,new.class_key,new.scope,new.pilot_window,new.staff_id)
   is distinct from (old.day,old.checkpoint_id,old.class_key,old.scope,old.pilot_window,old.staff_id) then
   raise exception 'Only coordinator/admin can change a register assignment' using errcode='42501';
  end if;
  if old.state='pending' and new.state='submitted' then
   if new.submitted_by is distinct from my_staff_id() then
    raise exception 'Submission must identify the signed-in staff member' using errcode='42501';
   end if;
   if exists(select 1 from students s where s.active and s.stype='Residential'
    and (s.grade||'|'||s.section=new.class_key or s.grade||'|*'=new.class_key) and not exists(
    select 1 from attendance a where a.duty_id=new.id and a.admission_no=s.admission_no)) then
    raise exception 'Include every residential student in this class' using errcode='22023';
   end if;
  end if;
 end if;
 return new;
end $$;
create trigger duties_pilot_complete before update on duties for each row execute function guard_pilot_register();
-- Explicit privileges work with RLS; no anonymous student access or TRUNCATE.
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated,service_role;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
revoke all on all functions in schema public from public,anon;
grant execute on all functions in schema public to authenticated,service_role;
revoke all on function reset_school_day(date) from authenticated,anon,public;
grant execute on function duty_health() to anon;
insert into app_env(key,value) values('environment','school-pilot') on conflict(key) do update set value=excluded.value;
select cron.unschedule(jobid) from cron.job where jobname in ('reset-day-for-testing','generate-duties-testing');
select cron.alter_job(jobid,schedule=>'30 18 * * *',command=>'select generate_duties_ahead();')
from cron.job where jobname='generate-duties-nightly';
notify pgrst,'reload schema';
