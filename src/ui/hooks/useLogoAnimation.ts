import { useState, useEffect } from "react";
import { LOGO_ANIMATION_INTERVAL_MS } from "../../constants.js";

/**
 * Advances a tick every intervalMs for logo color animation. Cleans up the interval on unmount.
 * @param intervalMs - Interval in ms (default from constants)
 * @returns Current tick (use with modulo for color index)
 */
export function useLogoAnimation(intervalMs: number = LOGO_ANIMATION_INTERVAL_MS): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return tick;
}
