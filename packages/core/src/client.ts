import type { Incident, IngestResult } from "./types.ts";

export interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class KosApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "KosApiError";
    this.status = status;
  }
}

export class KosClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: ctl.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          ...(init.headers ?? {}),
        },
      });
      const text = await res.text();
      if (!res.ok) {
        throw new KosApiError(text.slice(0, 500) || res.statusText, res.status);
      }
      return (text ? JSON.parse(text) : {}) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Push incidents. Safe to re-send: the server upserts on clientId. */
  async sendIncidents(incidents: Incident[]): Promise<IngestResult> {
    return this.request<IngestResult>("/api/incidents", {
      method: "POST",
      body: JSON.stringify({ incidents }),
    });
  }

  /** Every clientId the server already holds, for reconciling after a gap. */
  async knownClientIds(since?: number): Promise<string[]> {
    const q = since ? `?since=${since}` : "";
    const res = await this.request<{ clientIds: string[] }>(
      `/api/incidents${q}`,
      { method: "GET" },
    );
    return res.clientIds;
  }
}
