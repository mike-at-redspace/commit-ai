import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { Action } from "@core/config";
import { ACTIONS } from "@core/config";

interface ActionMenuProps {
  onSelect: (action: Action) => void;
  disabled?: boolean;
}

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
