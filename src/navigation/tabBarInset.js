import { TAB_BAR_HEIGHT } from "./AppTabBar";

/**
 * Bottom padding every tab screen's scroll content needs so the last row
 * clears the tab bar. Kept in one place and derived from the bar's real
 * height — a hardcoded number drifting out of sync silently makes the last
 * item unreachable.
 */
export const TAB_CONTENT_INSET = TAB_BAR_HEIGHT + 20;
