import React from "react";
import { Box, Text } from "ink";

interface InfoPanelProps {
  files: string[];
  showFiles?: boolean;
}

/**
 * Staged file count and optional file list for context.
 * @param props.files - List of staged file paths
 * @param props.showFiles - When true, show up to 10 file names
 */
export function InfoPanel({ files, showFiles = false }: InfoPanelProps) {
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
              {"  "}+ {file}
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
