# Student data

## The names here are not real

`students_415.csv` and `students_415_insert.sql` hold **415 generated Indian
names**, not the school's roll. They were swapped for mock names because this
repository is public and the original file is the school's actual 2025–26
register — real children, with admission numbers and residential status.

Everything except the names is real structure:

| Field | Real? |
|---|---|
| Name | **No** — generated |
| Admission number | Yes |
| Grade, section | Yes — all 23 class-sections |
| Student type | Yes — 303 residential, 112 day scholars |
| Roll number | Yes |
| Remedial flag | Yes |

That matters: group resolution, class sizes, the residential-only checkpoint
rules and every report behave exactly as they will in production. Only the
names differ.

## Swapping the real register back in

Before the pilot, import the school's real `Student_List_2025-26.xlsx` over
this data. Nothing in the app needs changing — the columns already match the
school's own file, which is why they were kept that way.

At that point this repository must not stay public, and the seed files here
should go back to being generated rather than committed.

## Regenerating

The generator lives outside the repo (it was a one-off), but it is
deterministic: names are assigned in `admission_no` order from a fixed seed,
so the CSV, the SQL file and the database all agree. If you regenerate, update
all three together or they will drift.
