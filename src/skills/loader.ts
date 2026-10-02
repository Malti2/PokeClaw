import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface Skill {
  /** Directory name, used as the skill id (e.g. "pdf"). */
  name: string;
  /** One-liner from frontmatter: when to use this skill. */
  description: string;
  /** Absolute path to the SKILL.md file. */
  path: string;
  /** Full SKILL.md content (frontmatter stripped). */
  content: string;
}

interface Frontmatter {
  name?: string;
  description?: string;
  [k: string]: unknown;
}

/** Minimal YAML-frontmatter parser: only top-level `key: value` pairs. */
export function parseFrontmatter(raw: string): { fm: Frontmatter; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: {}, body: raw };
  const fm: Frontmatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    let v: string = kv[2].trim();
    // Strip surrounding quotes.
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    fm[kv[1]] = v;
  }
  return { fm, body: raw.slice(m[0].length) };
}

/**
 * Scan skill directories for <name>/SKILL.md files.
 * OpenClaw-style: each skill is a folder with a SKILL.md carrying
 * frontmatter (name, description) + markdown instructions.
 */
export function loadSkills(dirs: string[]): Skill[] {
  const skills: Skill[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    let entries: string[];
    try {
      if (!existsSync(dir)) continue;
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const skillFile = join(dir, entry, "SKILL.md");
      let raw: string;
      try {
        if (!statSync(join(dir, entry)).isDirectory()) continue;
        raw = readFileSync(skillFile, "utf-8");
      } catch {
        continue;
      }
      const { fm, body } = parseFrontmatter(raw);
      const name = typeof fm.name === "string" && fm.name ? fm.name : entry;
      if (seen.has(name)) continue; // first dir wins
      seen.add(name);
      skills.push({
        name,
        description: typeof fm.description === "string" ? fm.description : "",
        path: skillFile,
        content: body.trim(),
      });
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** Ensure the default skills dir exists so users find where to drop skills. */
export function ensureSkillsDir(dir: string): void {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {
    // best effort
  }
}

/**
 * Compact catalog for the agent context note: names + one-liners only.
 * Full content is loaded on demand via the `load_skill` tool.
 */
export function skillsCatalogNote(skills: Skill[]): string {
  if (skills.length === 0) return "";
  const lines = skills.map(
    (s) => `- ${s.name}${s.description ? `: ${s.description}` : ""}`,
  );
  return [
    "Available skills (capabilities with detailed instructions):",
    ...lines,
    "Use the `load_skill` tool with a skill name to read its full instructions before using it.",
  ].join("\n");
}
