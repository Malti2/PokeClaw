#!/usr/bin/env bun
/**
 * PokeClaw — backward-compatible entrypoint.
 *
 * The implementation now lives in `src/` and is exposed through the `pokeclaw`
 * CLI (see `pokeclaw start`). This shim keeps `bun run server.ts` /
 * `ts-node server.ts` working for existing setups and service files by starting
 * the server in headless mode.
 */
import { runStart } from "./src/commands/start.js";

runStart({ headless: true });
