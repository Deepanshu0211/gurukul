-- Mock database only. Requires migration 035. Update the development generator in place.
-- Keeps its class-section, band and school-wide activity layout; Vedic is a separate group.
begin;
CREATE OR REPLACE FUNCTION public.generate_duties(p_day date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d     date := coalesce(p_day, school_today());
  stamp text := to_char(d, 'YYYYMMDD');
  n     int;
begin
  insert into duties (id, checkpoint_id, day, group_label, class_key, scope, band, house, staff_id, exclude_vedic)
  select
    'morn-' || replace(k.class_key, '|', '-') || '-' || stamp,
    'morning',
    d,
    case when split_part(k.class_key, '|', 2) = 'A'
         then 'Class ' || split_part(k.class_key, '|', 1)
         else 'Class ' || split_part(k.class_key, '|', 1) || ' ' ||
              initcap(lower(split_part(k.class_key, '|', 2)))
    end,
    k.class_key,
    null, null, null,
    -- The fallback that keeps the morning alive. `duties.staff_id` is not
    -- null, so without this a single class between teachers takes down the
    -- whole night's generation, for every class.
    coalesce(t.id, 'c1'), true
  from (select distinct grade || '|' || section as class_key from students where active and upper(trim(section))<>'VEDIC') k
  left join lateral (
    -- The trigger above makes two holders impossible, so this is now a single
    -- row rather than an arbitrary choice between two. Kept as min() because
    -- the data only became unambiguous a moment ago and older copies exist.
    select min(id) as id from staff where class_key = k.class_key
  ) t on true
  on conflict (id) do update
    set exclude_vedic = case when duties.state='pending' and not exists(select 1 from attendance a where a.duty_id=duties.id) then true else duties.exclude_vedic end,
        group_label = excluded.group_label,
        class_key   = excluded.class_key,
        staff_id    = coalesce(duties.staff_id, excluded.staff_id);

  insert into duties (id, checkpoint_id, day, group_label, class_key, scope, band, house, staff_id, exclude_vedic)
  select v.id || '-' || stamp, v.cp, d, v.label, null, v.scope, v.band, null,
         coalesce((select id from staff where id = v.staff), 'c1'), true
  from (values
    ('mang',      'mang',      'All residential students', 'res', null,      'c1'),
    ('bfast-pri', 'breakfast', 'Primary · residential',    'res', 'Primary', 'd1'),
    ('bfast-mid', 'breakfast', 'Middle · residential',     'res', 'Middle',  'd2'),
    ('bfast-sr',  'breakfast', 'Senior · residential',     'res', 'Senior',  'd3'),
    ('lunch-all', 'lunch',     'Whole school',             'all', null,      'c1'),
    ('night-res', 'night',     'All residential students', 'res', null,      'c2')
  ) as v(id, cp, label, scope, band, staff)
  on conflict (id) do update
    set exclude_vedic = case when duties.state='pending' and not exists(select 1 from attendance a where a.duty_id=duties.id) then true else duties.exclude_vedic end,
        group_label = excluded.group_label,
        scope       = excluded.scope,
        band        = excluded.band,
        staff_id    = coalesce(duties.staff_id, excluded.staff_id);


  -- One Vedic register per activity. Existing saved source memberships stay intact.
  insert into duties(id,checkpoint_id,day,group_label,class_key,scope,staff_id)
  select 'vedic-'||d0.checkpoint_id||'-'||stamp,d0.checkpoint_id,d,'Vedic','*|VEDIC',
    case when bool_and(coalesce(d0.scope='res',false)) then 'res' else 'all' end,'c1'
  from duties d0 where d0.day=d and d0.class_key is distinct from '*|VEDIC'
    and exists(select 1 from students s where active and upper(trim(section))='VEDIC')
    and not exists(select 1 from duties dv where dv.day=d and dv.checkpoint_id=d0.checkpoint_id and dv.class_key='*|VEDIC')
  group by d0.checkpoint_id
  on conflict(id) do nothing;

  select count(*) into n from duties where day = d;
  return n;
end;
$function$
;
commit;
