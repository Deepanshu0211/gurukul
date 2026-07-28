# Dev test credentials

Throwaway Supabase Auth accounts for testing the login flow during
development. They share one password because the accounts themselves are
disposable.

> **These accounts open the real student register.** The passwords are
> made up; the 415 student records behind them are the school's actual
> 2025–26 list — real names, admission numbers and residential status.
> Rotate these before the repository or the Supabase project is shared any
> wider, and delete them entirely before rollout.

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
