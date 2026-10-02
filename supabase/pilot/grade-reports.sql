-- Supporting reports for one Physical Activity register per grade.
-- Applied together with generator/guard replacements by the private consolidation runner.
create or replace function class_status_board(
 p_day date default current_date, p_checkpoint text default 'morning'
) returns table (
 grade int, section text, class_key text, class_label text, teacher text,
 res bigint, day_scholars bigint, strength bigint,
 res_present bigint, day_present bigint, res_absent bigint, day_absent bigint,
 sick bigint, not_reported bigint, on_duty bigint, unmarked bigint,
 submitted boolean, submitted_at timestamptz
) language sql stable security invoker set search_path=public as $$
 with roll as (
  select admission_no,grade from students
  where active and stype='Residential' and grade between 2 and 12
 ), marks as (
  select admission_no,status from attendance_detail
  where day=p_day and checkpoint_id=p_checkpoint
 ), duty as (
  select split_part(class_key,'|',1)::int as grade,bool_and(state='submitted') as submitted,
   max(submitted_at) filter(where state='submitted') as submitted_at
  from duties where day=p_day and checkpoint_id=p_checkpoint and class_key is not null
  group by split_part(class_key,'|',1)::int
 )
 select r.grade,'*'::text,r.grade||'|*','Class '||r.grade,t.name,
  count(r.admission_no),0::bigint,count(r.admission_no),
  count(m.admission_no) filter(where m.status is null or m.status in ('V','Y')),
  0::bigint,count(m.admission_no) filter(where m.status='A'),0::bigint,
  count(m.admission_no) filter(where m.status='S'),
  count(m.admission_no) filter(where m.status in ('H','G','O')),
  count(m.admission_no) filter(where m.status in ('V','Y')),
  count(r.admission_no) filter(where m.admission_no is null),
  coalesce(bool_or(d.submitted),false),max(d.submitted_at)
 from roll r left join marks m on m.admission_no=r.admission_no
 left join duty d on d.grade=r.grade
 left join lateral (
  select string_agg(distinct s.name,' / ' order by s.name) as name
  from duties dd join staff s on s.id=dd.staff_id
  where dd.day=p_day and dd.checkpoint_id=p_checkpoint
   and split_part(dd.class_key,'|',1)=r.grade::text
 ) t on true
 group by r.grade,t.name order by r.grade
$$;
grant execute on function class_status_board(date,text) to authenticated;

create or replace function duty_health()
returns table(day date,duties int,classes int,morning_duties int,unrostered int,healthy boolean)
language sql stable security definer set search_path=public as $$
 select school_today(),
  (select count(*)::int from duties where day=school_today()),
  (select count(distinct grade)::int from students where active and stype='Residential'),
  (select count(*)::int from duties where day=school_today() and checkpoint_id='morning'),
  (select count(*)::int from duties d left join staff s on s.id=d.staff_id
   where d.day=school_today() and (s.id is null or not s.active)),
  (school_today() < (select value::date from app_env where key='trial_start')
   or school_today() > (select value::date from app_env where key='trial_end')
   or (select count(*)=(select count(distinct grade) from students where active and stype='Residential')
    and bool_and(pilot_window and scope='res' and class_key like '%|*')
    from duties where day=school_today() and checkpoint_id='morning'))
$$;
