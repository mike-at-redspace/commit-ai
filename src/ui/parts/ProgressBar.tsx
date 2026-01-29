import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { GenerateProgressPhase } from "../../types.js";
import { PROGRESS_SPINNER_LABELS } from "../../constants.js";

interface ProgressBarProps {
  phase?: GenerateProgressPhase;
  isGenerating: boolean;
  error?: string;
  status?: string;
  /** Shown when ready and no error/status (e.g. truncated diff hint) */
  hint?: string;
}

/**
 * Spinner/phase label while generating, or error/status/hint when not.
 * @param props.phase - Current progress phase (session, sending, streaming)
 * @param props.isGenerating - When true, show spinner and phase label
 * @param props.error - Error message to show (takes precedence)
 * @param props.status - Status text (e.g. "Committing...")
 * @param props.hint - Hint text when ready and no error/status (e.g. truncated diff hint)
 */
export function ProgressBar({ phase, isGenerating, error, status, hint }: ProgressBarProps) {
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

  if (hint) {
    return (
      <Box paddingX={1} marginTop={1}>
        <Text color="cyan">{hint}</Text>
      </Box>
    );
  }

  return null;
}
