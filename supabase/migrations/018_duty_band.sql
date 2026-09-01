-- 018 — The grade band a duty covers.
--
-- WHY
-- `src/lib/duties.js` has resolved band duties since it was written:
--
--   const BANDS = { Primary: [2,5], Middle: [6,8], Senior: [9,12] };
--   ... else if (duty.band && BANDS[duty.band]) { ...filter by grade... }
--
-- and `fromRow` reads `r.band` off every duty row. No migration ever added the
-- column, so `duty.band` has been undefined for every duty the app has ever
-- loaded and that branch has never once run. A duty that meant "Middle school
-- at morning assembly" had no way to say so: the only groupings that actually
-- worked were one class (`class_key`), residential-only (`scope`), or the
-- entire register.
--
-- That is fine on a weekday, when morning attendance is taken class by class.
-- It is not fine on a Saturday. The whole school assembles at once, and the
-- alternative to a band was a single duty covering all four hundred children
-- handed to one teacher — a roll call nobody can complete inside a checkpoint
-- window, in an app whose entire purpose is that the window is not missed.
--
-- WHAT THIS IS
-- The missing column, and nothing else. No new behaviour: the code that reads
-- it has been in the app all along, waiting for a value.
--
-- NOTE ON SCOPE
-- `band` and `scope` compose rather than compete, which is already how
-- resolveGroup treats them — band narrows by grade, then scope drops day
-- scholars. "Senior residential at night" is band='Senior', scope='res'.
alter table duties add column if not exists band text;

-- Constrained, because a typo here is silent and expensive: resolveGroup falls
-- back to the WHOLE register for a band it does not recognise, so 'senior'
-- instead of 'Senior' would hand a teacher four hundred students rather than
-- raise anything. Added separately from the column so re-running is safe.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'duties_band_check') then
    alter table duties add constraint duties_band_check
      check (band is null or band in ('Primary','Middle','Senior'));
  end if;
end $$;

comment on column duties.band is
  'Primary (grades 2-5) | Middle (6-8) | Senior (9-12). Must match BANDS in src/lib/duties.js.';

-- ── VERIFY BY HAND ──────────────────────────────────────────────────────────
--   insert into duties (id, checkpoint_id, day, group_label, band, staff_id)
--   values ('probe','morning',current_date,'Middle · all students','Middle','t1');
--   -- open the app as t1: the duty must list only grades 6-8.
--   -- then, to prove the constraint is doing its job:
--   update duties set band = 'middle' where id = 'probe';  -- must FAIL
--   delete from duties where id = 'probe';
