-- 046 — One group can cover several classes (e.g. Class 1 + 2 + 5).
--
-- The class of a group (duty_defaults.class_key, copied into duties.class_key)
-- may now be a comma-separated list: '1|A,2|A,5|A'. Everyone in any of those
-- classes is in the register, including students added to them later — unlike
-- a hand-picked list, which is fixed. The generator copies class_key as it is,
-- so it needs no change; a list still counts as a class register for holidays.
-- The app and web read lists the same way (classGroups.classKeyList).
-- Re-runnable.

create or replace function public.attendance_group_contains(d public.duties, s public.students)
returns boolean language sql stable set search_path = public as $$
 select s.active
 and (d.scope is distinct from 'res' or s.stype <> 'Day Scholar')
 and (d.excluded is null or not (s.admission_no = any (d.excluded)))
 and case
  when d.members is not null then s.admission_no = any (d.members)
  else
   (not d.exclude_vedic or upper(trim(s.section)) <> 'VEDIC')
   and case
    when d.class_key is null then
      (d.band is null or (d.band = 'Primary' and s.grade between 2 and 5)
       or (d.band = 'Middle' and s.grade between 6 and 8) or (d.band = 'Senior' and s.grade between 9 and 12))
      and (d.house is null or s.house = d.house)
    else exists (
      select 1 from unnest(string_to_array(d.class_key, ',')) as k(key)
       where case
         when trim(k.key) = '*|VEDIC' then upper(trim(s.section)) = 'VEDIC'
         when trim(k.key) ~ '^[0-9]+\|\*$' then s.grade = split_part(trim(k.key), '|', 1)::int
         else s.grade || '|' || s.section = trim(k.key)
       end)
   end
 end
$$;
revoke all on function public.attendance_group_contains(public.duties, public.students) from public, anon;
grant execute on function public.attendance_group_contains(public.duties, public.students) to authenticated, service_role;

-- save_duty_default (036) checks that the class exists. Widen that one check
-- to every class in a list, editing the live definition in place so nothing
-- else in the function changes.
do $$
declare
  def text := pg_get_functiondef('public.save_duty_default(text,text,text,text,text,text,text,text[],text[],text,int[])'::regprocedure);
  old text := $o$if v_key is not null and v_key <> '*|VEDIC' and v_key !~ '^[0-9]+\|\*$'
     and not exists (select 1 from students where active and grade || '|' || section = v_key) then$o$;
  new text := $n$if v_key is not null and exists (
       select 1 from unnest(string_to_array(v_key, ',')) as k(key)
        where trim(k.key) <> '*|VEDIC' and trim(k.key) !~ '^[0-9]+\|\*$'
          and not exists (select 1 from students where active and grade || '|' || section = trim(k.key))) then$n$;
begin
  if position(new in def) > 0 then
    return;  -- already widened
  end if;
  if position(old in def) = 0 then
    raise exception 'save_duty_default has changed since 036; widen its class check by hand';
  end if;
  execute replace(def, old, new);
end $$;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- In the app: Checkpoints & groups → + → Class → tick two classes → Save.
--   select group_label, class_key from duty_defaults where class_key like '%,%';
--   select generate_duties_ahead();   -- the new register appears for today
