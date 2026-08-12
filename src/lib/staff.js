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
