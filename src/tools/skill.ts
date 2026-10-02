import { err, needString, ok, schemaFor, type ToolDefinition } from "./types";
import type { Skill } from "../skills/loader";

/**
 * OpenClaw-style progressive disclosure: the agent only sees the skill
 * catalog in its context note; full instructions load on demand.
 */
export function createLoadSkillTool(skills: Skill[]): ToolDefinition {
  const byName = new Map(skills.map((s) => [s.name, s]));
  return {
    name: "load_skill",
    description:
      "Load the full instructions of a skill by name. Skills are named " +
      "capabilities (see the skill catalog in your context). Always load a " +
      "skill before using it.",
    inputSchema: schemaFor(
      {
        name: {
          type: "string",
          description: `Skill name, one of: ${skills.map((s) => s.name).join(", ") || "(none installed)"}.`,
        },
      },
      ["name"],
    ),
    permission: "read",
    handler: async (args) => {
      const name = needString(args, "name");
      const skill = byName.get(name);
      if (!skill) {
        return err(
          `Unknown skill "${name}". Available: ${skills.map((s) => s.name).join(", ") || "(none)"}.`,
        );
      }
      return ok(`# Skill: ${skill.name}\n\n${skill.content}`);
    },
  };
}
