import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

export interface InputBoxProps {
  value: string;
  cursor: number;
  waiting: boolean;
  waitingSecs: number;
}

/** Multiline input box with block cursor, plus the waiting indicator. */
export function InputBox({ value, cursor, waiting, waitingSecs }: InputBoxProps) {
  if (waiting) {
    return (
      <Box>
        <Text color={theme.brand}>● </Text>
        <Text color={theme.brand} bold>
          Waiting for Poke…
        </Text>
        <Text color={theme.dim}> {waitingSecs}s (Esc to abort)</Text>
      </Box>
    );
  }

  const lines = value.split("\n");
  // Locate cursor line/col
  let remaining = cursor;
  let cursorLine = 0;
  let cursorCol = 0;
  for (let i = 0; i < lines.length; i++) {
    if (remaining <= lines[i].length) {
      cursorLine = i;
      cursorCol = remaining;
      break;
    }
    remaining -= lines[i].length + 1;
  }

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor={theme.dim} paddingX={1} flexDirection="column">
        {lines.map((line, i) => {
          if (i === cursorLine) {
            const before = line.slice(0, cursorCol);
            const at = line[cursorCol] ?? " ";
            const after = line.slice(cursorCol + 1);
            return (
              <Text key={i}>
                {before}
                <Text inverse>{at}</Text>
                {after}
              </Text>
            );
          }
          return <Text key={i}>{line || " "}</Text>;
        })}
      </Box>
      <Text color={theme.faint}> Enter to send · Alt+Enter for newline · / for commands</Text>
    </Box>
  );
}
