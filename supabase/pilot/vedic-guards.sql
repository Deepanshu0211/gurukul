-- Pilot-only supporting guards. Requires migration 035. No duties or attendance are changed.
begin;
CREATE OR REPLACE FUNCTION public.guard_pilot_attendance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d duties; clock timestamp:=clock_timestamp() at time zone 'Asia/Kolkata';
begin
 select * into d from duties where id=new.duty_id;
 if d.pilot_window then
  if not exists(select 1 from students s where s.admission_no=new.admission_no
   and s.active and s.stype='Residential'
   and attendance_group_contains(d,s)) then
   raise exception 'This student is outside this residential class register' using errcode='22023';
  end if;
  if not (d.state='submitted' and can_override()) and
   (clock < d.day::timestamp+interval '6 hours 15 minutes' or clock >= (d.day+1)::timestamp) then
   raise exception 'Physical Activity opens at 6:15 AM and closes at midnight' using errcode='42501';
  end if;
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.guard_pilot_register()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    and attendance_group_contains(new,s) and not exists(
    select 1 from attendance a where a.duty_id=new.id and a.admission_no=s.admission_no)) then
    raise exception 'Include every residential student in this class' using errcode='22023';
   end if;
  end if;
 end if;
 return new;
end $function$
;
commit;
