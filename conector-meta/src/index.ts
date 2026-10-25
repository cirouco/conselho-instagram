// Conector MCP (Streamable HTTP, sem estado) para a API do Instagram. Somente leitura.
// URL do conector: https://<seu-worker>.workers.dev/mcp/<CONNECTOR_SECRET>

import type { Env } from "./meta.ts";
import { TOOLS, runTool } from "./tools.ts";

const PROTOCOLOS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVIDOR = { name: "conector-meta-instagram", version: "0.1.0" };

function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const rpcErro = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function tratar(msg: any, env: Env): Promise<any | null> {
  const { id, method, params } = msg ?? {};
  const notificacao = id === undefined || id === null;

  switch (method) {
    case "initialize": {
      const pedida = params?.protocolVersion;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOLOS.includes(pedida) ? pedida : PROTOCOLOS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVIDOR,
          instructions:
            "Ferramentas somente leitura da API oficial do Instagram (Meta). Use ig_contas para descobrir as contas acessíveis; ig_posts e ig_insights_conta para métricas privadas; ig_concorrente para perfis profissionais de terceiros.",
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS.map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema,
            annotations: { readOnlyHint: true, openWorldHint: true },
          })),
        },
      };
    case "tools/call": {
      try {
        const resultado = await runTool(env, params?.name, params?.arguments ?? {});
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(resultado, null, 1) }] } };
      } catch (e) {
        return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: (e as Error).message }] } };
      }
    }
    default:
      if (notificacao) return null; // ex.: notifications/initialized
      return rpcErro(id, -32601, `Método não suportado: ${method}`);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/mcp\/([^/]+)\/?$/);

    if (url.pathname === "/" || url.pathname === "/health") return json({ ok: true, servidor: SERVIDOR });
    if (!m || !env.CONNECTOR_SECRET || !iguais(m[1], env.CONNECTOR_SECRET)) return json({ erro: "não encontrado" }, 404);
    if (!env.META_TOKEN) return json({ erro: "META_TOKEN não configurado" }, 500);

    if (req.method === "GET") return new Response(null, { status: 405, headers: { allow: "POST" } });
    if (req.method === "DELETE") return new Response(null, { status: 204 });
    if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });

    let corpo: any;
    try {
      corpo = await req.json();
    } catch {
      return json(rpcErro(null, -32700, "JSON inválido"), 400);
    }

    if (Array.isArray(corpo)) {
      const respostas = (await Promise.all(corpo.map((c) => tratar(c, env)))).filter(Boolean);
      return respostas.length ? json(respostas) : new Response(null, { status: 202 });
    }
    const resposta = await tratar(corpo, env);
    return resposta ? json(resposta) : new Response(null, { status: 202 });
  },
};
