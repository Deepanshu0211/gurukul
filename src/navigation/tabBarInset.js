import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout, spacing } from "../theme/theme";
import { TAB_BAR_HEIGHT } from "./AppTabBar";

/**
 * The padding a screen needs at each end so its content clears the system
 * bars and the floating tab bar.
 *
 * Both are hooks rather than constants because they depend on the device: a
 * fixed number left the last card half-hidden on a gesture-navigation phone
 * and a dead gap on one with hardware buttons.
 */

/**
 * Bottom padding for a tab screen's scroll content: the floating tab bar plus
 * the device's bottom safe-area inset, which the bar sits above.
 */
export function useTabContentInset(extra = 0) {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, spacing.sm) + spacing.md + extra;
}

/**
 * Top padding for a screen's first element.
 *
 * Screens pad by this instead of wrapping in `SafeAreaView edges={["top"]}`,
 * so scrolling content passes *behind* the status bar and is clipped by the
 * physical top of the screen. Clipping at the safe-area line instead put a
 * hard cut-off in the middle of the display, which is what made rows look
 * like they were being chopped off as you scrolled.
 *
 * The floor matters: on the web build and on phones with no notch the reported
 * top inset is 0, which left the screen title 24pt from the physical edge —
 * sitting right up against the clock and reading as if the whole app had been
 * shoved off the top of the display. `MIN_TOP` keeps that first line in the
 * same comfortable band on every device.
 */
const MIN_TOP = spacing.sm;

export function useScreenTopInset(extra = 0) {
  const insets = useSafeAreaInsets();
  return Math.max(insets.top, MIN_TOP) + layout.screenTop + extra;
}

/** Static fallback for styles declared outside a component. Prefer the hook. */
export const TAB_CONTENT_INSET = TAB_BAR_HEIGHT + spacing.lg + spacing.md;
