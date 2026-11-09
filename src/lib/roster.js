import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Checkpoints and the recurring roster (`duty_defaults`, migration 036).
 *
 * Every write is an RPC. Neither table has an INSERT/UPDATE policy for the
 * app, so the coordinator check inside each function is the only door —
 * `canManageRoster` in domain/roles.js only decides what the screen offers.
 */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
export const SCHOOL_DAYS = [1, 2, 3, 4, 5];

/** How a group picks its students. Drives the editor's chips. */
export const COVERAGE = {
  CLASS: "class",
  BAND: "band",
  HOUSE: "house",
  SCHOOL: "school",
  PICK: "pick",
};

export const checkpointFromRow = (r) =>
  r && {
    id: r.id,
    name: r.name,
    start: r.start_min,
    end: r.end_min,
    active: r.active !== false,
    mandatoryEscalation: !!r.mandatory_escalation,
  };

export const groupFromRow = (r) =>
  r && {
    id: r.id,
    checkpointId: r.checkpoint_id,
    label: r.group_label,
    classKey: r.class_key || null,
    scope: r.scope || null,
    band: r.band || null,
    house: r.house || null,
    members: r.members || null,
    excluded: r.excluded || [],
    staffId: r.staff_id || null,
    days: r.days || EVERY_DAY,
    active: r.active !== false,
  };

/** Which coverage chip a saved group belongs under. */
export const coverageOf = (g) =>
  g.members
    ? COVERAGE.PICK
    : g.classKey
      ? COVERAGE.CLASS
      : g.house
        ? COVERAGE.HOUSE
        : g.band
          ? COVERAGE.BAND
          : COVERAGE.SCHOOL;

/** "Mon–Fri", "Every day", "Mon, Wed, Fri". */
export function daysLabel(days) {
  const set = [...new Set(days || [])].sort();
  if (set.length === 7) return "Every day";
  if (set.join() === SCHOOL_DAYS.join()) return "Mon–Fri";
  if (set.join() === [1, 2, 3, 4, 5, 6].join()) return "Mon–Sat";
  if (!set.length) return "No days";
  return set.map((d) => WEEKDAYS[d]).join(", ");
}

/** Minutes from midnight → "16:30", and back. Null when it does not parse. */
export const toHHMM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function parseHHMM(text) {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(text || "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
};

export async function fetchRoster() {
  const [cps, groups] = await Promise.all([
    supabase.from("checkpoints").select("*").order("start_min"),
    supabase.from("duty_defaults").select("*").eq("active", true).order("group_label"),
  ]);
  if (cps.error) throw cps.error;
  if (groups.error) throw groups.error;
  return {
    checkpoints: (cps.data || []).map(checkpointFromRow),
    groups: (groups.data || []).map(groupFromRow),
  };
}

export const saveCheckpoint = ({ id, name, start, end, mandatoryEscalation }) =>
  rpc("save_checkpoint", {
    p_id: id || null,
    p_name: name,
    p_start: start,
    p_end: end,
    p_mandatory: !!mandatoryEscalation,
  }).then(checkpointFromRow);

export const setCheckpointActive = (id, active) =>
  rpc("set_checkpoint_active", { p_id: id, p_active: active }).then(checkpointFromRow);

/** Resolves to "deleted" or "deactivated" — see remove_checkpoint in 036. */
export const removeCheckpoint = (id) => rpc("remove_checkpoint", { p_id: id });

export const saveGroup = (g) =>
  rpc("save_duty_default", {
    p_id: g.id || null,
    p_checkpoint: g.checkpointId,
    p_label: g.label,
    p_class_key: g.classKey || null,
    p_scope: g.scope || null,
    p_band: g.band || null,
    p_house: g.house || null,
    p_members: g.members?.length ? g.members : null,
    p_excluded: g.excluded?.length ? g.excluded : null,
    p_staff: g.staffId || null,
    p_days: g.days,
  }).then(groupFromRow);

export const removeGroup = (id) => rpc("remove_duty_default", { p_id: id });

/**
 * Checkpoints + groups for the management screens. Loaded where it is shown,
 * not in SchoolDataContext: two roles open it occasionally, and the context
 * re-renders every screen on every change.
 */
export function useRoster() {
  const [state, setState] = useState({ checkpoints: [], groups: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setState(await fetchRoster());
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Show a just-saved checkpoint at once, before the reload comes back. */
  const applyCheckpoint = useCallback((cp) => {
    if (!cp) return;
    setState((s) => {
      const rest = s.checkpoints.filter((c) => c.id !== cp.id);
      return { ...s, checkpoints: [...rest, cp].sort((a, b) => a.start - b.start) };
    });
  }, []);

  return { ...state, loading, error, reload, applyCheckpoint };
}
