import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

export type Action = "commit" | "regenerate" | "cancel";

interface ActionMenuProps {
  onSelect: (action: Action) => void;
  disabled?: boolean;
}

const ACTIONS = [
  {
    label: "✓ Commit",
    value: "commit" as Action,
  },
  {
    label: "↻ Regenerate",
    value: "regenerate" as Action,
  },
  {
    label: "✕ Cancel",
    value: "cancel" as Action,
  },
];

export function ActionMenu({ onSelect, disabled = false }: ActionMenuProps) {
  if (disabled) {
    return null;
  }

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <Text color="cyan">? Action:</Text>
      <Box marginTop={1}>
        <SelectInput
          items={ACTIONS}
          onSelect={(item: { label: string; value: Action }) => onSelect(item.value)}
        />
      </Box>
    </Box>
  );
}
