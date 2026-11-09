import { supabase } from "./supabase";

/**
 * Maps a `staff` row to the shape the app uses. The database is snake_case;
 * the app is camelCase. Doing the translation in one place means screens
 * never have to know which convention they are looking at.
 */
export const fromRow = (r) =>
  r && {
    id: r.id,
    name: r.name,
    role: r.role,
    email: r.email,
    phone: r.phone || "",
    photoUrl: r.photo_url || null,
    classKey: r.class_key || null,
    classLabel: r.class_label || null,
    active: r.active !== false,
    // Set when a coordinator gave them a temporary password (048). The app
    // stops at the "choose your own password" screen until it is cleared.
    mustChangePassword: !!r.must_change_password,
  };

/**
 * The whole staff directory (active only, alphabetical).
 *
 * Every screen that shows "who owns this duty", "reassign to…" or the Staff
 * tab was reading the mock `STAFF` array, whose ids do not match the real
 * `staff.id` values coming back with a duty — so a duty owned by a real
 * teacher resolved to no name at all. RLS lets any signed-in user read the
 * directory (names and roles only), so this is safe to load once at startup.
 */
export async function fetchStaff() {
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data || []).map(fromRow);
}

/**
 * The staff row for an email, or null when there is none.
 *
 * Separate from `fetchStaffByEmail` because "no row" stopped being an error
 * when self-registration landed: a confirmed Auth account with no staff row is
 * the normal state of every teacher waiting for a coordinator. `single()`
 * reports that as PGRST116, which the caller would have to unpick to tell it
 * apart from a real failure.
 */
export async function fetchStaffMaybeByEmail(email) {
  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return fromRow(data);
}

export async function fetchStaffByEmail(email) {
  const { data, error } = await supabase.from("staff").select("*").eq("email", email).single();
  if (error) throw error;
  return fromRow(data);
}

export async function updateOwnPhone(staffId, phone) {
  const { data, error } = await supabase
    .from("staff")
    .update({ phone })
    .eq("id", staffId)
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

/**
 * Former staff, for the Roster's "Former staff" list. The directory query
 * above only returns active rows, and 012's read policy would hide the rest
 * anyway — this RPC serves them to coordinator and admin only (036).
 */
export async function fetchInactiveStaff() {
  const { data, error } = await supabase.rpc("list_inactive_staff");
  if (error) throw error;
  return (data || []).map(fromRow);
}

/**
 * Add a staff member directly, without them requesting access first. They
 * then sign up with this email and `link_staff_account` joins the two. A
 * coordinator can only add teachers; the database refuses any other role.
 */
export async function addStaffMember({ name, email, phone, role = "teacher", classKey = null }) {
  const { data, error } = await supabase.rpc("add_staff_member", {
    p_name: name,
    p_email: email,
    p_phone: phone || null,
    p_role: role,
    p_class_key: classKey || null,
  });
  if (error) throw error;
  return fromRow(Array.isArray(data) ? data[0] : data);
}

/**
 * Deactivate (flag + leaving date — never delete) or reactivate. Pending
 * duties and recurring groups move to `replacementId` in the same transaction;
 * the database refuses a deactivation that would orphan a pending duty.
 */
export async function setStaffActive(staffId, active, replacementId = null) {
  const { data, error } = await supabase.rpc("set_staff_active", {
    p_staff: staffId,
    p_active: active,
    p_replacement: replacementId || null,
  });
  if (error) throw error;
  return fromRow(Array.isArray(data) ? data[0] : data);
}

/**
 * Add a staff member AND create their login with a temporary password
 * (migration 048): the school default `Initial@123`, or a random one.
 * Returns `{ staffId, password }` so the coordinator can hand it over.
 */
export async function addStaffMemberWithLogin({
  name, email, phone, role = "teacher", classKey = null, random = false,
}) {
  const { data, error } = await supabase.rpc("add_staff_member_with_login", {
    p_name: name,
    p_email: email,
    p_phone: phone || null,
    p_role: role,
    p_class_key: classKey || null,
    p_random: !!random,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { staffId: row.staff_id, password: row.temp_password };
}

/** Create or reset a login with a temporary password. Returns the password. */
export async function setTemporaryPassword(staffId, random = false) {
  const { data, error } = await supabase.rpc("set_temporary_password", {
    p_staff: staffId,
    p_random: !!random,
  });
  if (error) throw error;
  return data;
}

/**
 * Login state for every staff member this coordinator manages, as
 * `{ [staffId]: { hasLogin, mustChange, tempPassword, kind, issuedAt } }`.
 * `tempPassword` is null once the person has chosen their own — nobody can
 * read that one. Empty for a server without 048.
 */
export async function fetchStaffLogins() {
  const { data, error } = await supabase.rpc("list_staff_logins");
  if (error) return {};
  const out = {};
  (data || []).forEach((r) => {
    out[r.staff_id] = {
      hasLogin: !!r.has_login,
      mustChange: !!r.must_change,
      tempPassword: r.temp_password || null,
      kind: r.kind || null,
      issuedAt: r.issued_at || null,
    };
  });
  return out;
}

/** The signed-in person replaces the temporary password they were given. */
export async function changeMyTemporaryPassword(password) {
  const { error } = await supabase.rpc("change_my_temporary_password", { p_password: password });
  if (error) throw error;
}

/** The text a coordinator hands over — one block, easy to paste into a chat. */
export const loginDetailsText = ({ name, email, password }) =>
  `BG-SAAR login for ${name}
` +
  `ID: ${email}
` +
  `Password: ${password}
` +
  `You will be asked to set your own password the first time you sign in.`;
