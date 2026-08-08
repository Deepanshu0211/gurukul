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
