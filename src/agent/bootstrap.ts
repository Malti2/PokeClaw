import { TunnelService, type TunnelLogger } from "../services/tunnel";
import { AgentSession } from "./session";
import { PokeClient, buildAgentMessage } from "../poke/client";
import { loadConfig, DEFAULT_SKILLS_DIR } from "../config";
import { loadSkills, ensureSkillsDir, skillsCatalogNote, type Skill } from "../skills/loader";

export interface AgentStack {
  tunnel: TunnelService;
  session: AgentSession;
  skills: Skill[];
}

/**
 * Shared wiring for every entry point (TUI, --print, tunnel command):
 * config -> disabled tools + skills -> TunnelService + AgentSession with
 * the skill catalog baked into the agent context note.
 */
export function createAgentStack(opts: { logger?: TunnelLogger } = {}): AgentStack {
  const cfg = loadConfig();
  ensureSkillsDir(DEFAULT_SKILLS_DIR);
  const dirs = [DEFAULT_SKILLS_DIR, ...(cfg.skillsDirs ?? [])];
  const disabledSkills = new Set(cfg.disabledSkills ?? []);
  const skills = loadSkills(dirs).filter((s) => !disabledSkills.has(s.name));

  const disabledTools = new Set<string>();
  if (cfg.tools) {
    for (const [name, on] of Object.entries(cfg.tools)) {
      if (!on) disabledTools.add(name);
    }
  }

  const tunnel = new TunnelService({ logger: opts.logger, disabledTools, skills });
  const note = skillsCatalogNote(skills);
  const session = new AgentSession(tunnel, new PokeClient(), {
    noteBuilder: (prompt) => buildAgentMessage(prompt, { skillsNote: note || undefined }),
  });
  return { tunnel, session, skills };
}
