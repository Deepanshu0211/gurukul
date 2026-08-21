/**
 * Turning failures into something a teacher can act on.
 *
 * The app used to put `e.message` straight into a dialog. On a dormitory
 * corridor with no signal that read:
 *
 *   Error: fetch failed: java.net.UnknownHostException: Unable to resolve
 *   host "ofuvjzxjbgsityacukva.supabase.co": No address associated with
 *   hostname
 *
 * which tells a teacher nothing they can do, and puts the project's hostname
 * on screen where a parent or student might be standing. Almost every failure
 * this app will actually meet is the same one — the phone is out of signal —
 * and that has an obvious remedy, so it deserves plain words and a Retry.
 *
 * Deliberately no `@react-native-community/netinfo`: knowing the radio is up
 * is not the same as knowing the request worked (school wi-fi with a captive
 * portal is online by that measure), and it is a native module, so it would
 * cost a rebuild to answer a question the failed request already answered.
 */

/**
 * Substrings seen across the platforms this runs on. Android surfaces DNS
 * failures as UnknownHostException, iOS as "Network request failed", the web
 * build as "Failed to fetch"; Supabase wraps all of them in "fetch failed".
 */
const OFFLINE_SIGNS = [
  "network request failed",
  "fetch failed",
  "failed to fetch",
  "unable to resolve host",
  "unknownhostexception",
  "no address associated with hostname",
  "network error",
  "networkerror",
  "enotfound",
  "econnrefused",
  "econnreset",
  "connection reset",
  "socketexception",
  "software caused connection abort",
  "timed out",
  "timeout",
  "the internet connection appears to be offline",
  "load failed",
];

const text = (e) =>
  `${e?.message || ""} ${e?.details || ""} ${e?.cause?.message || ""} ${
    typeof e === "string" ? e : ""
  }`.toLowerCase();

/** Whether this failure is "the phone could not reach the server". */
export function isOffline(e) {
  if (!e) return false;
  const t = text(e);
  return OFFLINE_SIGNS.some((sign) => t.includes(sign));
}

/**
 * A permission failure, which reads as an app bug to the user but is usually
 * a policy doing its job. Worth its own words so nobody retries forever.
 */
export function isDenied(e) {
  const t = text(e);
  return (
    e?.code === "42501" ||
    t.includes("row-level security") ||
    t.includes("violates row-level security") ||
    t.includes("permission denied") ||
    t.includes("not authorized")
  );
}

export const OFFLINE_TITLE = "You're offline";
export const OFFLINE_BODY =
  "This phone can't reach the school server. Check your wi-fi or mobile data, then try again.";

/**
 * `{ title, message, offline }` for a dialog.
 *
 * @param e        the caught error
 * @param fallback what to say when it is not a network or permission problem
 * @param keep     reassurance appended to the offline case — "Your marks are
 *                 still here". Only pass it when it is TRUE: a teacher who has
 *                 just walked a line of forty students needs to know whether
 *                 to start again, and a comforting lie is worse than silence.
 */
export function describeError(e, fallback, keep) {
  if (isOffline(e)) {
    return {
      offline: true,
      title: OFFLINE_TITLE,
      message: keep ? `${OFFLINE_BODY}\n\n${keep}` : OFFLINE_BODY,
    };
  }
  if (isDenied(e)) {
    return {
      offline: false,
      title: "Not allowed",
      message:
        "Your account does not have permission for this. Ask a coordinator or the school office.",
    };
  }
  return {
    offline: false,
    title: fallback?.title || "Something went wrong",
    // The raw message is the last resort, and only for the failures we did not
    // anticipate — where it is the only clue anyone will get.
    message: fallback?.message || e?.message || "Please try again.",
  };
}
