import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

/** Regeneration style: same, detailed, minimal, premium, or custom instruction */
export type RegenerateStyle = "same" | "detailed" | "minimal" | "premium" | "custom";

interface StyleMenuProps {
  onSelect: (style: RegenerateStyle) => void;
}

const STYLES = [
  {
    label: "Same style",
    value: "same" as RegenerateStyle,
  },
  {
    label: "More detailed",
    value: "detailed" as RegenerateStyle,
  },
  {
    label: "More concise",
    value: "minimal" as RegenerateStyle,
  },
  {
    label: "Retry with premium model",
    value: "premium" as RegenerateStyle,
  },
  {
    label: "Custom instruction...",
    value: "custom" as RegenerateStyle,
  },
];

/**
 * Regenerate-style selection: same, detailed, minimal, premium, or custom instruction.
 * @param props.onSelect - Callback when a style is selected
 */
export function StyleMenu({ onSelect }: StyleMenuProps) {
  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <Text color="cyan">? Regenerate with different style?</Text>
      <Box marginTop={1}>
        <SelectInput items={STYLES} onSelect={(item) => onSelect(item.value)} />
      </Box>
    </Box>
  );
}
