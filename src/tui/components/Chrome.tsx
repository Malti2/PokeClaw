import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

export function Header({ cwd }: { cwd: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={theme.brand} bold>
          🌴 pokeclaw
        </Text>
        <Text color={theme.dim}> via Poke</Text>
      </Box>
      <Text color={theme.faint}>{cwd}</Text>
    </Box>
  );
}

export function StatusBar({
  connected,
  reconnecting,
  permissionMode,
  toolCount,
  skillCount,
}: {
  connected: boolean;
  reconnecting?: boolean;
  permissionMode: string;
  toolCount?: number;
  skillCount?: number;
}) {
  const label = connected ? "connected" : reconnecting ? "reconnecting…" : "disconnected";
  return (
    <Box marginTop={1}>
      <Text color={connected ? theme.success : reconnecting ? theme.warning : theme.error}>{connected ? "●" : reconnecting ? "◌" : "○"}</Text>
      <Text color={theme.dim}> poke {label}</Text>
      <Text color={theme.faint}> · </Text>
      <Text color={theme.dim}>{permissionMode} mode</Text>
      {typeof toolCount === "number" && (
        <>
          <Text color={theme.faint}> · </Text>
          <Text color={theme.dim}>{toolCount} tools</Text>
        </>
      )}
      {typeof skillCount === "number" && skillCount > 0 && (
        <>
          <Text color={theme.faint}> · </Text>
          <Text color={theme.dim}>{skillCount} skills</Text>
        </>
      )}
      <Text color={theme.faint}> · </Text>
      <Text color={theme.faint}>Ctrl+C exit · Esc abort</Text>
    </Box>
  );
}
