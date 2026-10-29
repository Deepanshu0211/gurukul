-- Default groups for the SRS checkpoints 036 created, for the MOCK project.
--
-- Not run against the pilot: there the school decides who marks Sports and
-- Dinner, and a coordinator adds those groups in the app (Account → Checkpoints).
-- Populations follow attendance-requirements §6 — sports by band for everyone,
-- self study and dinner by band for residential students, remedial as a
-- hand-picked list. Re-runnable: each group is keyed by a fixed id.
--
-- Run after 036. Then `select generate_duties_ahead();` puts them on today.

insert into duty_defaults (id, checkpoint_id, group_label, scope, band, staff_id, days) values
  ('ddsports-pri', 'sports',        'Primary',                'all', 'Primary', 'd1', '{1,2,3,4,5}'),
  ('ddsports-mid', 'sports',        'Middle',                 'all', 'Middle',  'd2', '{1,2,3,4,5}'),
  ('ddsports-sr',  'sports',        'Senior',                 'all', 'Senior',  'd3', '{1,2,3,4,5}'),
  ('ddstudy-pri',  'evening-study', 'Primary · residential',  'res', 'Primary', 'd1', '{1,2,3,4,5}'),
  ('ddstudy-mid',  'evening-study', 'Middle · residential',   'res', 'Middle',  'd2', '{1,2,3,4,5}'),
  ('ddstudy-sr',   'evening-study', 'Senior · residential',   'res', 'Senior',  'd3', '{1,2,3,4,5}'),
  ('dddinner-pri', 'dinner',        'Primary · residential',  'res', 'Primary', 'd1', '{0,1,2,3,4,5,6}'),
  ('dddinner-mid', 'dinner',        'Middle · residential',   'res', 'Middle',  'd2', '{0,1,2,3,4,5,6}'),
  ('dddinner-sr',  'dinner',        'Senior · residential',   'res', 'Senior',  'd3', '{0,1,2,3,4,5,6}')
on conflict (id) do nothing;

-- Remedial: the students the register flags as remedial, or a dozen from
-- Class 6 when nobody is flagged yet, so the custom-list path has data.
insert into duty_defaults (id, checkpoint_id, group_label, scope, members, staff_id, days)
select 'ddremedial', 'remedial', 'Remedial batch', 'all',
       coalesce(
         (select array_agg(admission_no) from students where active and remedial),
         (select array_agg(admission_no) from (
            select admission_no from students where active and grade = 6 order by roll_no limit 12) x)),
       't13', '{1,2,3,4,5}'
on conflict (id) do nothing;

select generate_duties_ahead();
