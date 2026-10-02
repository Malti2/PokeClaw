/**
 * Tool definitions: JSON-schema-described tools with a permission level and
 * an async handler. Tools are pure functions of (args, context).
 */

export type PermissionLevel = "read" | "write" | "bash";

export interface ToolContext {
  cwd: string;
}

export interface ToolImage {
  /** Base64-encoded image bytes. */
  data: string;
  /** e.g. "image/png". */
  mimeType: string;
}

export interface ToolResult {
  /** Human/LLM-readable output. */
  output: string;
  isError?: boolean;
  /** Optional images attached to the result (e.g. screenshots). */
  images?: ToolImage[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  permission: PermissionLevel;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

function jsonSchema(
  properties: Record<string, { type: string; description: string }>,
  required: string[],
): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

export function schemaFor(
  properties: Record<string, { type: string; description: string }>,
  required: string[],
): Record<string, unknown> {
  return jsonSchema(properties, required);
}

/** Pull a required string arg, throwing a clear error when missing/wrong type. */
export function needString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`Missing or invalid required argument "${key}" (expected non-empty string).`);
  }
  return v;
}

export function optString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function optNumber(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function ok(output: string): ToolResult {
  return { output };
}

export function err(output: string): ToolResult {
  return { output: output.startsWith("Error:") ? output : `Error: ${output}`, isError: true };
}
