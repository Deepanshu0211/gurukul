import { supabase } from "./supabase";

/**
 * Passwords.
 *
 * Two paths, and neither ever shows one person another person's password:
 *
 *  - Your own, while signed in: re-check the current password, then set the
 *    new one through Supabase Auth.
 *  - Someone who cannot sign in: a coordinator issues a one-time code
 *    (migration 036), reads it to them, and they redeem it on the sign-in
 *    screen with a password of their own. The code is stored as a hash, works
 *    once, and dies after 30 minutes or five wrong guesses.
 */

export const MIN_PASSWORD = 8;

/** A reason the password is not acceptable, or null. Shown under the field. */
export function passwordProblem(pw, confirm) {
  if (!pw) return "Enter a new password";
  if (pw.length < MIN_PASSWORD) return `At least ${MIN_PASSWORD} characters`;
  if (confirm !== undefined && pw !== confirm) return "The two passwords do not match";
  return null;
}

export async function changeOwnPassword(email, current, next) {
  // Signing in again is the only way Supabase offers to prove the current
  // password; it refreshes the same session rather than opening a new one.
  const check = await supabase.auth.signInWithPassword({ email, password: current });
  if (check.error) {
    const e = new Error("Your current password is not correct.");
    e.code = "22023";
    throw e;
  }
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) throw error;
}

/** Coordinator/admin. Returns `{ code, expiresAt }` — show it once. */
export async function issueResetCode(staffId) {
  const { data, error } = await supabase.rpc("issue_password_reset", { p_staff: staffId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { code: row.code, expiresAt: row.expires_at };
}

/** "ABCD-EFGH" for reading aloud; the database ignores the dash. */
export const formatCode = (code) => (code ? `${code.slice(0, 4)}-${code.slice(4)}` : "");

/**
 * Redeem a code without being signed in. Resolves to "ok"; rejects with a
 * person-readable message otherwise. Deliberately does not say whether the
 * email or the code was the wrong part.
 */
export async function redeemResetCode(email, code, password) {
  const { data, error } = await supabase.rpc("redeem_password_reset", {
    p_email: email.trim(),
    p_code: code,
    p_password: password,
  });
  if (error) throw error;
  if (data === "ok") return data;
  const e = new Error(
    data === "weak"
      ? `Choose a password of at least ${MIN_PASSWORD} characters.`
      : "That code is not valid for this email, or it has expired. Ask your coordinator for a new one."
  );
  e.code = "22023";
  throw e;
}
