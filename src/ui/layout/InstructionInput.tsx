import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface InstructionInputProps {
  onSubmit: (instruction: string) => void;
  onCancel: () => void;
}

/**
 * Free-text instruction input for custom regeneration.
 * @param props.onSubmit - Callback with trimmed instruction when user submits
 * @param props.onCancel - Callback when user cancels (empty submit)
 */
export function InstructionInput({ onSubmit, onCancel }: InstructionInputProps) {
  const [value, setValue] = useState("");

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <Text color="cyan">? Enter instruction for regeneration:</Text>
      <Box marginTop={1}>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(val) => {
            if (val.trim()) {
              onSubmit(val.trim());
            } else {
              onCancel();
            }
          }}
        />
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Enter to submit, empty line to cancel</Text>
      </Box>
    </Box>
  );
}
