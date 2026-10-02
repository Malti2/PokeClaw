import React from "react";
import { Text } from "ink";
import { theme } from "./theme";

let keyCounter = 0;
const k = () => `md-${keyCounter++}`;

/** Inline formatting: **bold**, *italic*, `code`, [text](url). */
function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(<Text key={k()}>{text.slice(last, m.index)}</Text>);
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(
        <Text key={k()} bold>
          {tok.slice(2, -2)}
        </Text>,
      );
    } else if (tok.startsWith("*")) {
      out.push(
        <Text key={k()} italic>
          {tok.slice(1, -1)}
        </Text>,
      );
    } else if (tok.startsWith("`")) {
      out.push(
        <Text key={k()} color={theme.code} backgroundColor="#1e1e1e">
          {tok.slice(1, -1)}
        </Text>,
      );
    } else {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      if (lm) {
        out.push(
          <Text key={k()} color={theme.brand} underline>
            {lm[1]}
          </Text>,
        );
        out.push(
          <Text key={k()} color={theme.dim}>
            {" "}
            ({lm[2]})
          </Text>,
        );
      } else {
        out.push(<Text key={k()}>{tok}</Text>);
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<Text key={k()}>{text.slice(last)}</Text>);
  return out;
}

/**
 * Minimal markdown renderer for assistant output: headings, code fences,
 * unordered/ordered lists, blockquotes, and inline formatting.
 */
export function renderMarkdown(source: string): React.ReactNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = /^```(\S*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1];
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <Text key={k()}>
          <Text color={theme.dim}>{lang ? `── ${lang} ` : "── "}────────────────────</Text>
          {"\n"}
          <Text color={theme.code}>{code.join("\n")}</Text>
        </Text>,
      );
      continue;
    }

    // Heading
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <Text key={k()} bold color={level === 1 ? theme.brand : theme.assistant}>
          {renderInline(heading[2])}
        </Text>,
      );
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <Text key={k()} color={theme.dim} italic>
          {"│ "}
          {quote.join("\n│ ")}
        </Text>,
      );
      continue;
    }

    // List (bulleted or numbered)
    const listItem = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (listItem) {
      const items: { marker: string; text: string }[] = [];
      while (i < lines.length) {
        const lm = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!lm) break;
        const marker = /^\d/.test(lm[1]) ? lm[1] : "•";
        items.push({ marker, text: lm[2] });
        i++;
      }
      blocks.push(
        <Text key={k()}>
          {items.map((it, idx) => (
            <Text key={k()}>
              <Text color={theme.brand}>{it.marker}</Text> {renderInline(it.text)}
              {idx < items.length - 1 ? "\n" : ""}
            </Text>
          ))}
        </Text>,
      );
      continue;
    }

    // Blank line -> spacer
    if (/^\s*$/.test(line)) {
      blocks.push(<Text key={k()}>{" "}</Text>);
      i++;
      continue;
    }

    // Paragraph: gather consecutive plain lines
    const para: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<Text key={k()}>{renderInline(para.join(" "))}</Text>);
  }

  return blocks;
}
