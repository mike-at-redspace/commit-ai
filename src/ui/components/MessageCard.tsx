import React from "react";
import { Box, Text } from "ink";

interface MessageCardProps {
  message: string;
  isStreaming: boolean;
}

export function MessageCard({ message, isStreaming }: MessageCardProps) {
  const borderColor = isStreaming ? "yellow" : "white";
  const lines = message.split("\n");
  const subject = lines[0] || "";
  const body = lines.slice(1).filter((line) => line.trim());

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
            <Text>{subject}</Text>
            {body.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                {body.map((line, index) => (
                  <Text key={index}>{line}</Text>
                ))}
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
