import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { LOGO_ANIMATION_COLORS, LOGO_ANIMATION_INTERVAL_MS, LOGO_LINES } from "../../constants.js";

interface HeaderProps {
  branch: string;
  version?: string;
}

export function Header({ branch, version = "1.0.0" }: HeaderProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), LOGO_ANIMATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Box flexDirection="column">
        {LOGO_LINES.map((line, i) => (
          <Text
            key={i}
            bold
            color={LOGO_ANIMATION_COLORS[(tick + i) % LOGO_ANIMATION_COLORS.length]}
          >
            {line}
          </Text>
        ))}
      </Box>
      <Text color="gray">
        v{version} [{branch}]
      </Text>
    </Box>
  );
}
