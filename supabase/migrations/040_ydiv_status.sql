-- 040 — "YDIV": Your day in Vrindavan.
--
-- A new entry type the school asked for. Accounted for, marked per checkpoint
-- (not spanning), and counted exactly like Activity / Self study on every
-- sheet that splits statuses into columns (017 Saturday sheet, 020/035 class
-- status board).
--
-- Those functions name the on-duty codes inline as ('V','Y'). Rather than copy
-- each body here and risk drifting from its latest version, the block below
-- rewrites the LIVE definition of every public function containing that list.
-- Re-runnable: an already-widened list no longer matches.

insert into status_types (code, label, accounted, spanning)
values ('D', 'YDIV (Your day in Vrindavan)', true, false)
on conflict (code) do update
  set label = excluded.label, accounted = excluded.accounted, spanning = excluded.spanning;

do $$
declare
  f   record;
  def text;
begin
  for f in
    select p.oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and pg_get_functiondef(p.oid) ~ '\(''V'',\s*''Y''\)'
  loop
    def := regexp_replace(pg_get_functiondef(f.oid),
                          '\(''V'',\s*''Y''\)', '(''V'',''Y'',''D'')', 'g');
    execute def;
  end loop;
end $$;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
--   select code, label from status_types where code = 'D';          -- 1 row
--   select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and pg_get_functiondef(p.oid) ~ '''V'',''Y'',''D''';
--   -- expect saturday_report and class_status_board
