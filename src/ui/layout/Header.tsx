import React from "react";
import { Box, Text } from "ink";
import { LOGO_ANIMATION_COLORS, LOGO_LINES } from "@core/config";
import { useLogoAnimation } from "@ui/hooks/useLogoAnimation";

const BRANCH_MAX_LENGTH = 25;
const BRANCH_MIN_DISPLAY_LEN = 10;

function truncateBranch(branch: string, maxLen?: number): string {
  const limit = maxLen ?? BRANCH_MAX_LENGTH;
  if (branch.length <= limit) return branch;
  return branch.slice(0, Math.max(1, limit - 3)) + "...";
}

interface HeaderProps {
  branch: string;
  version?: string;
  /** When set, branch is truncated to fit (version + brackets use the rest) */
  maxWidth?: number;
}

/**
 * Animated logo and branch/version display in the dashboard header.
 * @param props.branch - Current branch name
 * @param props.version - Optional version string (default "1.0.0")
 * @param props.maxWidth - Optional; when set, branch length is limited to fit terminal width
 */
export function Header({ branch, version = "1.0.0", maxWidth }: HeaderProps) {
  const tick = useLogoAnimation();
  const reservedForVersion = 4 + String(version).length;
  const branchMaxLen =
    maxWidth != null && maxWidth > 0
      ? Math.max(BRANCH_MIN_DISPLAY_LEN, maxWidth - reservedForVersion)
      : BRANCH_MAX_LENGTH;
  const displayBranch = truncateBranch(branch, branchMaxLen);

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
        v{version} [{displayBranch}]
      </Text>
    </Box>
  );
}
