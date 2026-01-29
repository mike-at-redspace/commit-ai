import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

/** User action when message is ready: commit, regenerate, or cancel */
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

/**
 * Commit / Regenerate / Cancel action choices shown when the message is ready.
 * @param props.onSelect - Callback when an action is selected
 * @param props.disabled - When true, renders nothing
 */
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
