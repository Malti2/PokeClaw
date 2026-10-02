import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

export interface SlashCommand {
  name: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/help", description: "Show help" },
  { name: "/clear", description: "Clear the transcript" },
  { name: "/config", description: "Show current config (key redacted)" },
  { name: "/tools", description: "List available tools" },
  { name: "/skills", description: "List installed skills" },
  { name: "/tunnel", description: "Tunnel connection status" },
  { name: "/exit", description: "Quit pokeclaw" },
];

export function filterSlashCommands(input: string): SlashCommand[] {
  const q = input.toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
}

export function SlashMenu({
  commands,
  selected,
}: {
  commands: SlashCommand[];
  selected: number;
}) {
  if (commands.length === 0) return null;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.dim} paddingX={1}>
      {commands.map((c, i) => (
        <Text key={c.name} color={i === selected ? theme.brand : theme.dim} bold={i === selected}>
          {i === selected ? "❯ " : "  "}
          {c.name}
          <Text color={theme.faint}> — {c.description}</Text>
        </Text>
      ))}
    </Box>
  );
}
