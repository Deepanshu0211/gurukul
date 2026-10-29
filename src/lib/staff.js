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
