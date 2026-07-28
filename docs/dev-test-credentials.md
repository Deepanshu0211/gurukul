# Dev test credentials — DO NOT use in production

These are throwaway Supabase Auth accounts created for testing the login flow
during development. Shared password for all of them since it's dummy data.

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
