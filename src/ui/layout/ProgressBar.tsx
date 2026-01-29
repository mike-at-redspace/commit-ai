import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { GenerateProgressPhase } from "@core/config";
import { PROGRESS_SPINNER_LABELS } from "@core/config";

const ERROR_MAX_LENGTH = 80;

function truncateError(error: string, maxWidth?: number): string {
  if (maxWidth == null || maxWidth <= 0 || error.length <= maxWidth) return error;
  const limit = Math.max(maxWidth - 4, ERROR_MAX_LENGTH);
  if (error.length <= limit) return error;
  return error.slice(0, limit - 3) + "...";
}

interface ProgressBarProps {
  phase?: GenerateProgressPhase;
  isGenerating: boolean;
  error?: string;
  status?: string;
  /** Shown when ready and no error/status (e.g. truncated diff hint) */
  hint?: string;
  /** When set, long error messages are truncated to avoid overflow */
  maxWidth?: number;
}

/**
 * Spinner/phase label while generating, or error/status/hint when not.
 * @param props.phase - Current progress phase (session, sending, streaming)
 * @param props.isGenerating - When true, show spinner and phase label
 * @param props.error - Error message to show (takes precedence)
 * @param props.status - Status text (e.g. "Committing...")
 * @param props.hint - Hint text when ready and no error/status (e.g. truncated diff hint)
 * @param props.maxWidth - Optional; when set, long error text is truncated
 */
export function ProgressBar({
  phase,
  isGenerating,
  error,
  status,
  hint,
  maxWidth,
}: ProgressBarProps) {
  if (error) {
    const displayError = truncateError(error, maxWidth);
    return (
      <Box paddingX={1} marginTop={1}>
        <Text color="red">✕ {displayError}</Text>
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
