import { err, needString, ok, schemaFor, type ToolDefinition } from "./types";

const MAX_CHARS = 12_000;

/** Fetch a URL and return readable text (HTML tags stripped). */
export const webfetchTool: ToolDefinition = {
  name: "webfetch",
  description: "Fetch a URL and return its readable text content. HTML is stripped to plain text.",
  inputSchema: schemaFor(
    {
      url: { type: "string", description: "The http(s) URL to fetch." },
    },
    ["url"],
  ),
  permission: "read",
  handler: async (args) => {
    const url = needString(args, "url");
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return err(`Invalid URL: ${url}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return err(`Only http(s) URLs are supported.`);
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      let res: Response;
      try {
        res = await fetch(url, {
          signal: controller.signal,
          headers: { "user-agent": "pokeclaw/0.2" },
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) return err(`HTTP ${res.status} fetching ${url}.`);
      const contentType = res.headers.get("content-type") ?? "";
      const text = await res.text();
      let out: string;
      if (contentType.includes("html")) {
        out = text
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/[ \t]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      } else {
        out = text.trim();
      }
      if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS) + "\n… (truncated)";
      return ok(out || "(empty response)");
    } catch (e) {
      return err(`Fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
