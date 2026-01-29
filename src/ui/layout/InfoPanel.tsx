import React from "react";
import { Box, Text } from "ink";

const FILE_PATH_MAX_LENGTH = 50;

function truncatePath(path: string, maxWidth?: number): string {
  const limit = maxWidth != null && maxWidth > 0 ? maxWidth - 4 : FILE_PATH_MAX_LENGTH;
  if (path.length <= limit) return path;
  return path.slice(0, limit - 3) + "...";
}

interface InfoPanelProps {
  files: string[];
  showFiles?: boolean;
  /** When set, long file paths are truncated to avoid overflow */
  maxWidth?: number;
}

/**
 * Staged file count and optional file list for context.
 * @param props.files - List of staged file paths
 * @param props.showFiles - When true, show up to 10 file names
 * @param props.maxWidth - Optional; when set, long paths are truncated
 */
export function InfoPanel({ files, showFiles = false, maxWidth }: InfoPanelProps) {
  const fileCount = files.length;
  const displayFiles = showFiles ? files.slice(0, 10) : [];
  const hasMore = files.length > 10;

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      <Text>
        <Text color="cyan">Changes: </Text>
        <Text color="white">
          {fileCount} file{fileCount !== 1 ? "s" : ""}
        </Text>
      </Text>
      {showFiles && displayFiles.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {displayFiles.map((file, index) => (
            <Text key={index} color="gray">
              {"  "}+ {truncatePath(file, maxWidth)}
            </Text>
          ))}
          {hasMore && (
            <Text color="gray">
              {"  "}... ({files.length - 10} more)
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}
