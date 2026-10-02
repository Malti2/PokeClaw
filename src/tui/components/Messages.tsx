import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import { renderMarkdown } from "../markdown";

export function UserMessage({ text }: { text: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.user} bold>
        ❯ You
      </Text>
      <Box marginLeft={2}>
        <Text>{text}</Text>
      </Box>
    </Box>
  );
}

export function AssistantMessage({ text }: { text: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.brand} bold>
        🌴 Poke
      </Text>
      <Box marginLeft={2} flexDirection="column">
        {renderMarkdown(text)}
      </Box>
    </Box>
  );
}

export function SystemMessage({ text }: { text: string }) {
  return (
    <Box marginBottom={1}>
      <Text color={theme.dim} italic>
        {text}
      </Text>
    </Box>
  );
}

export function ErrorMessage({ text }: { text: string }) {
  return (
    <Box marginBottom={1}>
      <Text color={theme.error}>✗ {text}</Text>
    </Box>
  );
}
