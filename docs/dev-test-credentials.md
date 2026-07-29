# Dev test credentials

Throwaway Supabase Auth accounts for testing the login flow during
development. They share one password because the accounts themselves are
disposable.

> The 415 student records behind these accounts use **generated names**, not
> the school's real roll — see [`docs/data/README.md`](data/README.md).
> Delete these accounts and issue real staff logins before rollout, and note
> that once the real register is imported this repository must not stay
> public.

| Email | Password | Role |
|---|---|---|
| admin@gurukula.org | Gurukula@123 | admin (highest privilege) |
| coordinator@gurukula.org | Gurukula@123 | coordinator |
| mod@gurukula.org | Gurukula@123 | coordinator |
| principal@gurukula.org | Gurukula@123 | management |
| krishna.saha@gurukula.org | Gurukula@123 | teacher |
| ajay.solanki@gurukula.org | Gurukula@123 | teacher |
| nurse@gurukula.org | Gurukula@123 | nurse |

Before real rollout: delete these accounts (Supabase → Authentication → Users)
and replace with real staff logins tied to their actual emails/phones.
