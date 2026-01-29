import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface CustomInstructionInputProps {
  onSubmit: (instruction: string) => void;
  onCancel: () => void;
}

export function CustomInstructionInput({ onSubmit, onCancel }: CustomInstructionInputProps) {
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
        <Text color="gray">Press Enter to submit, Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
}
