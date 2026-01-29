import React from "react";
import { Box, Text } from "ink";

/** Wrap a line to fit within maxWidth (soft wrap by inserting newlines). */
function wrapLine(line: string, maxWidth: number): string[] {
  if (maxWidth <= 0 || line.length <= maxWidth) return [line];
  const result: string[] = [];
  let remaining = line;
  while (remaining.length > maxWidth) {
    result.push(remaining.slice(0, maxWidth));
    remaining = remaining.slice(maxWidth);
  }
  if (remaining.length > 0) result.push(remaining);
  return result;
}

interface ContentCardProps {
  message: string;
  isStreaming: boolean;
  /** When set, long lines are wrapped to this width to avoid layout overflow */
  maxWidth?: number;
  /** When set, content is limited to this many lines to avoid vertical overflow */
  maxHeight?: number;
}

/**
 * Commit message display with streaming vs ready styling (border color).
 * @param props.message - Commit message text (subject + optional body)
 * @param props.isStreaming - When true, show streaming border (yellow)
 * @param props.maxWidth - Optional; when set, long lines are wrapped
 * @param props.maxHeight - Optional; when set, total visible lines are capped
 */
export function ContentCard({ message, isStreaming, maxWidth, maxHeight }: ContentCardProps) {
  const borderColor = isStreaming ? "yellow" : "white";
  const lines = message.split("\n");
  const subject = lines[0] || "";
  const body = lines.slice(1).filter((line) => line.trim());
  const wrap =
    maxWidth != null && maxWidth > 0 ? (s: string) => wrapLine(s, maxWidth) : (s: string) => [s];

  const subjectLines = wrap(subject);
  const bodyLines = body.flatMap((line) => wrap(line));
  const totalLines = subjectLines.length + bodyLines.length;
  const cap = maxHeight != null && maxHeight > 0 ? maxHeight : totalLines;
  const showTruncation = totalLines > cap;
  const visibleSubjectLines = subjectLines;
  const visibleBodyCount = showTruncation
    ? Math.max(0, cap - subjectLines.length - 1)
    : bodyLines.length;
  const visibleBodyLines = bodyLines.slice(0, visibleBodyCount);
  const hiddenCount = totalLines - subjectLines.length - visibleBodyLines.length;

  return (
    <Box
      flexDirection="column"
      marginX={1}
      marginBottom={1}
      borderStyle="round"
      borderColor={borderColor}
      padding={1}
    >
      <Box flexDirection="column">
        {message ? (
          <>
            {visibleSubjectLines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
            {(visibleBodyLines.length > 0 || (showTruncation && hiddenCount > 0)) && (
              <Box flexDirection="column" marginTop={1}>
                {visibleBodyLines.map((part, i) => (
                  <Text key={i}>{part}</Text>
                ))}
                {showTruncation && hiddenCount > 0 && (
                  <Text color="gray">
                    … ({hiddenCount} more line{hiddenCount !== 1 ? "s" : ""})
                  </Text>
                )}
              </Box>
            )}
          </>
        ) : (
          <Text color="gray">Generating message...</Text>
        )}
      </Box>
    </Box>
  );
}
