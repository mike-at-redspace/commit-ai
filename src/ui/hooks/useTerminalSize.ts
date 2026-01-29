import { useEffect, useState } from "react";

const FALLBACK_COLUMNS = 60;
const FALLBACK_ROWS = 20;

/**
 * Returns current terminal dimensions and updates on resize.
 * Uses process.stdout.columns/rows with fallbacks when not a TTY.
 */
export function useTerminalSize(): { columns: number; rows: number } {
  const [size, setSize] = useState({
    columns: process.stdout.columns ?? FALLBACK_COLUMNS,
    rows: process.stdout.rows ?? FALLBACK_ROWS,
  });

  useEffect(() => {
    function updateSize() {
      if (process.stdout.isTTY) {
        process.stdout.write("\x1b[2J\x1b[H");
      }
      setSize({
        columns: process.stdout.columns ?? FALLBACK_COLUMNS,
        rows: process.stdout.rows ?? FALLBACK_ROWS,
      });
    }

    process.stdout.on("resize", updateSize);
    return () => {
      process.stdout.off("resize", updateSize);
    };
  }, []);

  return size;
}
