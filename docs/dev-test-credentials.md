# Dev test credentials

Throwaway Supabase Auth accounts for testing during development. They share
one password because the accounts themselves are disposable.

**Password for every account below: `Gurukula@123`**

> Student names and admission numbers are **generated** — see
> [`supabase/seed-mock-school.sql`](../supabase/seed-mock-school.sql). The class
> teachers are the school's real ones, taken off their own Morning Attendance
> Report so the test register matches the paper it replaces. Delete these
> accounts and issue real staff logins before rollout, and note that this
> repository must not stay public while they exist.

## Creating them

Run [`supabase/seed-auth-users.sql`](../supabase/seed-auth-users.sql) in the SQL
editor. It creates an Auth account for every staff row in one statement,
confirms the address, and points the staff row at it.

Doing it by hand — Authentication → Users → **Add user**, with **Auto Confirm**
on — still works and is worth knowing, but it is 26 accounts.

The email must match the `staff` row exactly. Both seed files link the two by
address, and a staff row with no `auth_user_id` can do nothing at all under
RLS: every policy in migration 002 keys off it. That failure is silent in both
directions — the app just shows less than it should.

## The register these accounts belong to

18 classes, 411 students (297 residential, 114 day scholars), shaped like
the school's own form: Grades 2-5 one class each, Grades 6-12 split into
Krishna and Balram.

## Oversight and duty staff

| Email | Name | Role | Class |
|---|---|---|---|
| `coordinator@gurukula.org` | Ashram Coordinator | Coordinator | — |
| `mod@gurukula.org` | MOD | Coordinator | — |
| `principal@gurukula.org` | Principal Office | MOD / Management | — |
| `admin@gurukula.org` | Admin Desk | Administrator | — |
| `nurse@gurukula.org` | Sister Nurse | Nurse | — |

## Class teachers

The register's own, on the register's own classes.

| Email | Name | Role | Class |
|---|---|---|---|
| `krishna.saha@gurukula.org` | Krishna Saha Mt | Teacher | Class 2 |
| `sunidhi.shukla@gurukula.org` | Sunidhi Shukla Mt | Teacher | Class 3 |
| `dharmshila@gurukula.org` | Dharmshila Mt | Teacher | Class 4 |
| `anu.ag@gurukula.org` | Anu Ag Mt | Teacher | Class 5 |
| `sarita@gurukula.org` | Sarita Mt | Teacher | Class 6 Krishna |
| `satyavrata@gurukula.org` | Satyavrata Pr | Teacher | Class 6 Balram |
| `yatinath@gurukula.org` | Yatinath Pr | Teacher | Class 7 Krishna |
| `pooja@gurukula.org` | Pooja Mt | Teacher | Class 7 Balram |
| `shivani@gurukula.org` | Shivani Mt | Teacher | Class 8 Krishna |
| `sakshi.nimai@gurukula.org` | Sakshi Nimai Pr | Teacher | Class 8 Balram |
| `nimai.sundar@gurukula.org` | Nimai Sundar Pr | Teacher | Class 9 Krishna |
| `chandra.shekhar@gurukula.org` | Chandra Shekhar Pr | Teacher | Class 9 Balram |
| `hitesh@gurukula.org` | Hitesh Pr | Teacher | Class 10 Krishna |
| `ajay.solanki@gurukula.org` | Ajay Solanki Pr | Teacher | Class 10 Balram |
| `brajraj@gurukula.org` | Brajraj Pr | Teacher | Class 11 Krishna |
| `tarun@gurukula.org` | Tarun Pr | Teacher | Class 11 Balram |
| `murli.vilas@gurukula.org` | Murli Vilas Pr | Teacher | Class 12 Krishna |
| `manish@gurukula.org` | Manish Pr | Teacher | Class 12 Balram |

## Cover teachers

No class of their own. They take the band breakfast duties, and they are who a
coordinator reassigns a duty to when a class teacher is away.

| Email | Name | Role | Class |
|---|---|---|---|
| `gopal.das@gurukula.org` | Gopal Das Pr | Teacher | — |
| `radha.priya@gurukula.org` | Radha Priya Mt | Teacher | — |
| `jagannath.das@gurukula.org` | Jagannath Pr | Teacher | — |

## A good starting set

You do not need all 26. One class teacher, the coordinator, the MOD, the admin
and one cover teacher exercises every screen and every permission boundary:

| Email | Why |
|---|---|
| `krishna.saha@gurukula.org` | A class teacher with a class — marking, "My Class", their own status |
| `coordinator@gurukula.org` | Reassigning duties, approving access requests, overruling a mark |
| `mod@gurukula.org` | Oversight without the power to re-roster — the narrower of the two |
| `admin@gurukula.org` | The office view |
| `gopal.das@gurukula.org` | Duty staff with no class, which is its own set of edge cases |

The rest stay as names a duty can be assigned to.
