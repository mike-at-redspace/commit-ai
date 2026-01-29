import React from "react";
import { Box, Text } from "ink";

interface ContextPanelProps {
  files: string[];
  showFiles?: boolean;
}

export function ContextPanel({ files, showFiles = false }: ContextPanelProps) {
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
