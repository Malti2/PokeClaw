import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { formatDuration } from "../src/util/duration.js";

const ENV_KEYS = [
  "POKECLAW_PORT",
  "POKECLAW_ROOTS",
  "POKECLAW_TOKEN",
  "POKECLAW_POLICY",
  "POKECLAW_LOG_LEVEL",
  "POKECLAW_TUNNEL_ENABLED",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("loadConfig", () => {
  it("uses defaults when nothing is set", () => {
    const c = loadConfig();
    expect(c.port).toBe(3741);
    expect(c.policy).toBe("full");
    expect(c.roots.length).toBeGreaterThan(0);
  });

  it("reads config from environment variables", () => {
    process.env.POKECLAW_PORT = "9999";
    process.env.POKECLAW_TOKEN = "secret";
    process.env.POKECLAW_POLICY = "readonly";
    process.env.POKECLAW_TUNNEL_ENABLED = "1";
    const c = loadConfig();
    expect(c.port).toBe(9999);
    expect(c.token).toBe("secret");
    expect(c.policy).toBe("readonly");
    expect(c.tunnel.enabled).toBe(true);
  });

  it("splits comma-separated roots", () => {
    process.env.POKECLAW_ROOTS = "/tmp/a, /tmp/b";
    const c = loadConfig();
    expect(c.roots).toEqual(["/tmp/a", "/tmp/b"]);
  });

  it("falls back to default for an invalid policy", () => {
    process.env.POKECLAW_POLICY = "nonsense";
    expect(loadConfig().policy).toBe("full");
  });
});

describe("formatDuration", () => {
  it.each([
    [5, "5s"],
    [65, "1m 5s"],
    [3661, "1h 1m 1s"],
    [90061, "1d 1h 1m 1s"],
  ])("formats %i seconds as %s", (secs, expected) => {
    expect(formatDuration(secs)).toBe(expected);
  });
});
