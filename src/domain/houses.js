/**
 * The four houses, in the order the printed Saturday sheet lists them
 * (migration 017 seeds `houses` with this `sort_order`). A house the school
 * adds later still appears — after these four, alphabetically.
 */
export const HOUSE_ORDER = ["Vrindavan", "Goverdhan", "Nandgaon", "Barsana"];

export const NO_HOUSE = "No house yet";

/** Theme tone per house, so each one reads as its own category at a glance. */
export const HOUSE_TONES = {
  Vrindavan: "success",
  Goverdhan: "warning",
  Nandgaon: "info",
  Barsana: "danger",
};

export const houseRank = (name) => {
  if (name === NO_HOUSE || !name) return 1000;
  const i = HOUSE_ORDER.indexOf(name);
  return i === -1 ? 100 : i;
};

/** Houses present in the register, in sheet order. */
export const housesIn = (students) =>
  [...new Set((students || []).map((s) => s.house).filter(Boolean))].sort(
    (a, b) => houseRank(a) - houseRank(b) || a.localeCompare(b)
  );
