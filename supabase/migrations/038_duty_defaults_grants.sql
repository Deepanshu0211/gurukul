-- 038 — table privileges for the tables 036 created.
--
-- 036 created `duty_defaults` and `password_resets` but granted nothing on
-- them. The mock project auto-grants new tables to the API roles, so it worked
-- there; the pilot project does not, so every read of `duty_defaults` failed
-- with "permission denied for table" (42501) — even for a coordinator, and even
-- for service_role. The Checkpoints screen showed "Not allowed".
--
-- RLS still decides which rows come back (036: any active staff may read the
-- roster). Writes stay RPC-only: no INSERT/UPDATE/DELETE grant, no write policy.
-- `password_resets` is read only by security-definer functions, so the client
-- roles get nothing on it. Re-runnable.

revoke all on table public.duty_defaults from anon;
grant select on table public.duty_defaults to authenticated;
grant all on table public.duty_defaults to service_role;

revoke all on table public.password_resets from anon, authenticated;
grant all on table public.password_resets to service_role;
