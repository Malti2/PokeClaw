import type { PokeClawConfig } from "./config.js";
import { DEFAULT_CONFIG } from "./config.js";

let active: PokeClawConfig = DEFAULT_CONFIG;

export function setActiveConfig(config: PokeClawConfig): void {
  active = config;
}

export function getConfig(): PokeClawConfig {
  return active;
}
