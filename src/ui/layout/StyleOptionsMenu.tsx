import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { RegenerateStyle } from "@core/config";
import { STYLES } from "@core/config";

interface StyleOptionsMenuProps {
  onSelect: (style: RegenerateStyle) => void;
}

/**
 * Regenerate-style selection: same, detailed, minimal, premium, or custom instruction.
 * @param props.onSelect - Callback when a style is selected
 */
export function StyleOptionsMenu({ onSelect }: StyleOptionsMenuProps) {
  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <Text color="cyan">? Regenerate with different style?</Text>
      <Box marginTop={1}>
        <SelectInput items={STYLES} onSelect={(item) => onSelect(item.value)} />
      </Box>
    </Box>
  );
}
