/** Typed client for the monolithic PokeClaw server's local status endpoints. */

export interface HealthInfo {
  status: string;
  name: string;
  version: string;
  auth: boolean;
  roots: number;
}

export interface ServerStats {
  status: string;
  uptime: string;
  uptimeSeconds: number;
  commandsToday: number;
  topCommands: { command: string; count: number }[];
  startedAt: string;
  connection: {
    serverListening: boolean;
    connectionEstablished: boolean;
    connectionEstablishedAt: string | null;
    startupNotificationSent: boolean;
    notifyEndpointConfigured: boolean;
  };
}

export interface ToolCall {
  timestamp: string;
  tool: string;
  preview: string;
}

async function getJson<T>(url: string, timeoutMs = 2500): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export class ServerClient {
  constructor(private readonly port: number) {}

  private base(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  health(): Promise<HealthInfo | null> {
    return getJson<HealthInfo>(`${this.base()}/health`);
  }

  stats(): Promise<ServerStats | null> {
    return getJson<ServerStats>(`${this.base()}/stats`);
  }

  async consoleLines(): Promise<string[]> {
    const data = await getJson<{ lines: { stream: string; line: string }[] }>(
      `${this.base()}/console`,
    );
    return data ? data.lines.map((entry) => entry.line) : [];
  }

  async logLines(): Promise<string[]> {
    const data = await getJson<{ lines: string[] }>(`${this.base()}/logs`);
    return data ? data.lines : [];
  }

  async toolCalls(): Promise<ToolCall[]> {
    const data = await getJson<{ calls: ToolCall[] }>(`${this.base()}/tool-calls`);
    return data ? data.calls : [];
  }
}
