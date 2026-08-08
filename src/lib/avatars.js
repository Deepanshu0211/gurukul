import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";
import { supabase } from "./supabase";

const BUCKET = "avatars";

// Photos off a phone camera are several megabytes; the bucket caps at 2MB and
// the avatar renders at ~52px. Resizing before upload keeps uploads fast on
// the school's patchy connection and keeps storage costs near zero.
const MAX_EDGE = 512;
const QUALITY = 0.7;

/**
 * Storage path for a user's avatar. The first path segment is the auth user
 * id, which is what the storage RLS policy checks — so a user can only ever
 * write inside their own folder.
 */
const pathFor = (authUserId, ext) => `${authUserId}/avatar.${ext}`;

async function ensurePermission(kind) {
  const req =
    kind === "camera"
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;
  const { granted } = await req();
  if (!granted) {
    throw new Error(
      kind === "camera"
        ? "Camera access is off. Enable it for this app in your phone's settings."
        : "Photo access is off. Enable it for this app in your phone's settings."
    );
  }
}

/** Opens the camera or photo library. Returns a local file URI, or null if
 *  the user backed out. */
export async function pickImage(source = "library") {
  await ensurePermission(source);

  const options = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1], // avatars are round; square input avoids surprise cropping
    quality: 1,
  };

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0].uri;
}

/**
 * Downscale, compress, and return the image as base64.
 *
 * base64 rather than a file URI because React Native's fetch() returns an
 * EMPTY ArrayBuffer for local file:// URIs — the upload appears to succeed
 * and silently writes a 0-byte object. Reading the bytes directly is the
 * only reliable path.
 */
async function compressToBase64(uri) {
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_EDGE, height: MAX_EDGE } }],
    { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!out.base64) throw new Error("Could not read the selected image.");
  return out.base64;
}

/**
 * Uploads a local image as the signed-in user's avatar and records the URL on
 * their staff row. Returns the public URL.
 *
 * Overwrites the existing file at the same path rather than creating a new
 * one, so replacing a photo can never orphan the old file in storage.
 */
export async function uploadAvatar(localUri, staffId) {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("You need to be signed in to change your photo.");

  const base64 = await compressToBase64(localUri);
  const bytes = decode(base64);

  // Guard against the silent-empty-upload failure mode: better to fail loudly
  // here than to store a 0-byte file and show the user a blank avatar.
  if (!bytes || bytes.byteLength === 0) {
    throw new Error("The image came back empty. Try another photo.");
  }

  const path = pathFor(authUser.id, "jpg");
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  // Cache-bust: the path is stable across replacements, so without a unique
  // query the phone and CDN would keep serving the previous image.
  const url = `${publicUrl}?v=${Date.now()}`;

  const { error: dbError } = await supabase
    .from("staff")
    .update({ photo_url: url })
    .eq("id", staffId);
  if (dbError) throw new Error(dbError.message);

  return url;
}

/** Removes the photo from storage and clears it on the staff row. */
export async function removeAvatar(staffId) {
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error("You need to be signed in to change your photo.");

  // Storage removal is best-effort — clearing the database reference is what
  // actually takes the photo out of the app, so a storage hiccup must not
  // leave the user stuck with an image they asked to delete.
  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([pathFor(authUser.id, "jpg")]);
  if (storageError) console.warn("Avatar file not removed:", storageError.message);

  const { error: dbError } = await supabase
    .from("staff")
    .update({ photo_url: null })
    .eq("id", staffId);
  if (dbError) throw new Error(dbError.message);
}
