import React from "react";
import { Box, Text } from "ink";
import { LOGO_ANIMATION_COLORS, LOGO_LINES } from "../../constants.js";
import { useLogoAnimation } from "../hooks/useLogoAnimation.js";

interface HeaderProps {
  branch: string;
  version?: string;
}

/**
 * Animated logo and branch/version display in the dashboard header.
 * @param props.branch - Current branch name
 * @param props.version - Optional version string (default "1.0.0")
 */
export function Header({ branch, version = "1.0.0" }: HeaderProps) {
  const tick = useLogoAnimation();

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
