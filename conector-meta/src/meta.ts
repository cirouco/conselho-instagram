// Cliente mínimo da Graph API (Instagram API com Facebook Login). Somente leitura.

export interface Env {
  META_TOKEN: string;
  CONNECTOR_SECRET: string;
  META_APP_SECRET?: string;
  GRAPH_VERSION?: string;
  DEFAULT_IG_USER_ID?: string;
}

export class GraphError extends Error {
  code?: number;
  subcode?: number;
  status?: number;
  constructor(message: string, code?: number, subcode?: number, status?: number) {
    super(message);
    this.code = code;
    this.subcode = subcode;
    this.status = status;
  }
}

async function appsecretProof(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class Graph {
  private proof?: Promise<string>;
  private env: Env;
  constructor(env: Env) {
    this.env = env;
    if (env.META_APP_SECRET) this.proof = appsecretProof(env.META_TOKEN, env.META_APP_SECRET);
  }

  get version(): string {
    return this.env.GRAPH_VERSION || "v26.0";
  }

  async get(path: string, params: Record<string, string | number | undefined> = {}): Promise<any> {
    const url = path.startsWith("https://")
      ? new URL(path)
      : new URL(`https://graph.facebook.com/${this.version}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    if (!url.searchParams.has("access_token")) url.searchParams.set("access_token", this.env.META_TOKEN);
    if (this.proof && !url.searchParams.has("appsecret_proof")) url.searchParams.set("appsecret_proof", await this.proof);

    const res = await fetch(url.toString(), { method: "GET" });
    let body: any;
    try {
      body = await res.json();
    } catch {
      throw new GraphError(`Resposta inválida da Graph API (HTTP ${res.status})`, undefined, undefined, res.status);
    }
    if (!res.ok || body?.error) {
      const e = body?.error ?? {};
      throw new GraphError(e.message || `HTTP ${res.status}`, e.code, e.error_subcode, res.status);
    }
    return body;
  }

  /** Segue a paginação até `max` itens. */
  async list(path: string, params: Record<string, string | number | undefined>, max: number): Promise<any[]> {
    const out: any[] = [];
    let page = await this.get(path, params);
    while (true) {
      out.push(...(page.data ?? []));
      const next = page.paging?.next;
      if (out.length >= max || !next) break;
      page = await this.get(next);
    }
    return out.slice(0, max);
  }
}

/** Executa tarefas com concorrência limitada. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function idadeDias(timestamp?: string, agora = Date.now()): number | null {
  if (!timestamp) return null;
  const t = Date.parse(timestamp);
  return Number.isNaN(t) ? null : Math.floor((agora - t) / 86_400_000);
}

export function mediana(nums: number[]): number | null {
  const v = nums.filter((n) => typeof n === "number" && !Number.isNaN(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
