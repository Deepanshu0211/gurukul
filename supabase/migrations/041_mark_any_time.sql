-- 041 — Teachers can mark a register before or after its time window.
--
-- The pilot guard (supabase/pilot/physical-activity.sql, vedic-guards.sql)
-- refused attendance before 6:15 AM and after midnight. The school asked for
-- that lock to go. Kept: the residential-register check, and a register for a
-- FUTURE day still cannot be filled in early. Corrections by an overseer are
-- unaffected. Re-runnable; harmless where the pilot trigger is not installed.

create or replace function public.guard_pilot_attendance()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare d duties;
begin
 select * into d from duties where id=new.duty_id;
 if d.pilot_window then
  if not exists(select 1 from students s where s.admission_no=new.admission_no
   and s.active and s.stype='Residential'
   and attendance_group_contains(d,s)) then
   raise exception 'This student is outside this residential class register' using errcode='22023';
  end if;
  if not (d.state='submitted' and can_override()) and d.day > school_today() then
   raise exception 'This register opens on %', to_char(d.day, 'DD Mon') using errcode='42501';
  end if;
 end if;
 return new;
end $function$;

-- ── VERIFY (teacher login, pilot project) ───────────────────────────────────
-- Submit a pending register for today before its start time -> succeeds.
-- Submit tomorrow's register today                           -> 42501.
