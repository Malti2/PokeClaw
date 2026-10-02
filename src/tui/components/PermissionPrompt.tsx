import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

export interface PendingPermission {
  toolName: string;
  summary: string;
  detail: string;
}

/**
 * Permission prompt for a tool call requested by Poke.
 * 1 = Yes, 2 = No, 3 = Yes, don't ask again this session.
 */
export function PermissionPrompt({ pending }: { pending: PendingPermission }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.tool} paddingX={1}>
      <Box>
        <Text color={theme.tool} bold>
          ⚠ Poke wants to run:
        </Text>
        <Text> {pending.summary}</Text>
      </Box>
      <Text color={theme.dim}>{pending.detail}</Text>
      <Text>
        <Text color={theme.success} bold>
          1
        </Text>
        <Text color={theme.dim}> Yes · </Text>
        <Text color={theme.error} bold>
          2
        </Text>
        <Text color={theme.dim}> No · </Text>
        <Text color={theme.brand} bold>
          3
        </Text>
        <Text color={theme.dim}> Yes, don't ask again this session</Text>
      </Text>
    </Box>
  );
}
