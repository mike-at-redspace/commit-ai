import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { GenerateProgressPhase } from "../../ai.js";
import { PROGRESS_SPINNER_LABELS } from "../../constants.js";

interface StatusBarProps {
  phase?: GenerateProgressPhase;
  isGenerating: boolean;
  error?: string;
  status?: string;
}

export function StatusBar({ phase, isGenerating, error, status }: StatusBarProps) {
  if (error) {
    return (
      <Box paddingX={1} marginTop={1}>
        <Text color="red">✕ {error}</Text>
      </Box>
    );
  }

  if (isGenerating && phase) {
    return (
      <Box paddingX={1} marginTop={1}>
        <Text>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>{" "}
          <Text color="gray">{PROGRESS_SPINNER_LABELS[phase]}</Text>
        </Text>
      </Box>
    );
  }

  if (status) {
    return (
      <Box paddingX={1} marginTop={1}>
        <Text color="gray">{status}</Text>
      </Box>
    );
  }

  return null;
}
