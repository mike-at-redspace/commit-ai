import { useEffect } from "react";

/**
 * Runs the given callback once after mount. Use for initial setup (e.g. triggering generation).
 * Dependencies are intentionally empty so the effect runs only on mount.
 * @param fn - Callback to run once on mount
 */
export function useRunOnceOnMount(fn: () => void): void {
  useEffect(() => {
    fn();
  }, []);
}
