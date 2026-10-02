-- Run manually in the PILOT project's Supabase SQL Editor as postgres.
-- This is a testing utility, not a migration or scheduled job.
-- Change v_day to an explicit DATE if resetting a different testing day.
begin;

create schema if not exists pilot_reset_backups;
revoke all on schema pilot_reset_backups from public, anon, authenticated;
create table if not exists pilot_reset_backups.attendance_resets (
  backed_up_at timestamptz not null default clock_timestamp(),
  reset_day date not null,
  snapshot jsonb not null
);
alter table pilot_reset_backups.attendance_resets enable row level security;
revoke all on pilot_reset_backups.attendance_resets from public, anon, authenticated;

do $$
declare
  v_day date := (clock_timestamp() at time zone 'Asia/Kolkata')::date;
  v_count integer;
begin
  if (select value from public.app_env where key = 'environment')
     is distinct from 'school-pilot' then
    raise exception 'Reset refused: this is not the school pilot database';
  end if;

  -- Block submissions while the snapshot and reset are performed.
  lock table public.duties, public.attendance, public.alert_resolutions,
    public.audit_log in share row exclusive mode;
  select count(*) into v_count from public.duties where day = v_day;
  if v_count = 0 then
    raise exception 'No registers exist for %. Nothing was reset.', v_day;
  end if;

  insert into pilot_reset_backups.attendance_resets(reset_day, snapshot)
  select v_day, jsonb_build_object(
    'duties', coalesce((select jsonb_agg(to_jsonb(d)) from public.duties d where d.day = v_day), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(to_jsonb(a)) from public.attendance a join public.duties d on d.id = a.duty_id where d.day = v_day), '[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(to_jsonb(a)) from public.alert_resolutions a join public.duties d on d.id = a.duty_id where d.day = v_day), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(a)) from public.audit_log a join public.duties d on d.id = a.duty_id where d.day = v_day and a.action in ('duty_submitted', 'attendance_override')), '[]'::jsonb)
  );

  delete from public.alert_resolutions a using public.duties d
    where a.duty_id = d.id and d.day = v_day;
  delete from public.audit_log a using public.duties d
    where a.duty_id = d.id and d.day = v_day
      and a.action in ('duty_submitted', 'attendance_override');
  delete from public.attendance a using public.duties d
    where a.duty_id = d.id and d.day = v_day;
  update public.duties
    set state = 'pending', submitted_by = null, submitted_at = null,
        corrected_by = null, corrected_at = null
    where day = v_day;

  raise notice 'Reset %: % registers pending. Backup saved; assignments and other dates preserved.', v_day, v_count;
end $$;

commit;
