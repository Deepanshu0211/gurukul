import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";

/**
 * Keep a list where the person left it when they come back to the screen.
 *
 * On a phone a screen underneath a pushed page stays mounted and keeps its
 * scroll position by itself. On the web build the navigator hides it, the
 * browser drops the scroll offset, and Back landed at the top of a 400-row
 * register instead of on the child the coordinator was looking at. This
 * remembers the last offset and restores it whenever the screen regains focus
 * — a no-op on a phone, where it is already there.
 *
 *   const memory = useScrollMemory();
 *   <SectionList ref={memory.ref} onScroll={memory.onScroll(otherHandler)} … />
 */

// Retried across the slide-back animation: until the screen is displayed
// again its list has no height, and a scrollTo then lands at 0.
const RETRY_MS = [0, 60, 180, 400, 700];
const SETTLE_MS = 250;

export function useScrollMemory() {
  const ref = useRef(null);
  const y = useRef(0);
  const focused = useRef(false);
  const commit = useRef(null);

  // Wraps the screen's own scroll handler (EdgeFade's, usually) so both run.
  const onScroll = useCallback(
    (next) => (e) => {
      const ne = e?.nativeEvent;
      // Leaving the screen on the web build resets its scroll to 0 and
      // reports that as a scroll — a moment BEFORE the screen hears it has
      // lost focus, while it still looks visible. So a position is only kept
      // once it has held for SETTLE_MS: a person's scroll comes to rest, that
      // reset never gets the chance before blur cancels it.
      if (focused.current && ne?.layoutMeasurement?.height !== 0) {
        const at = ne?.contentOffset?.y || 0;
        clearTimeout(commit.current);
        commit.current = setTimeout(() => {
          if (focused.current) y.current = at;
        }, SETTLE_MS);
      }
      next?.(e);
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      const target = y.current;
      const timers = [];
      const last = RETRY_MS[RETRY_MS.length - 1];
      if (target > 0) {
        RETRY_MS.forEach((ms) =>
          timers.push(
            setTimeout(() => {
              const list = ref.current;
              const scroller = list?.getScrollResponder?.() || list;
              scroller?.scrollTo?.({ x: 0, y: target, animated: false });
            }, ms)
          )
        );
      }
      // Record again once the restore has had its chance.
      timers.push(setTimeout(() => (focused.current = true), target > 0 ? last + 50 : 0));
      return () => {
        focused.current = false;
        clearTimeout(commit.current);
        timers.forEach(clearTimeout);
      };
    }, [])
  );

  return { ref, onScroll };
}
