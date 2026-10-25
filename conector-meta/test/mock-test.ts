// Teste local com a Graph API simulada (não chama a Meta). Rode: npm test
import worker from "../src/index.ts";

const env = { META_TOKEN: "tok", CONNECTOR_SECRET: "s3cr3t", META_APP_SECRET: "appsecret", GRAPH_VERSION: "v26.0" };
const chamadas: string[] = [];

function resposta(u: URL): any {
  const p = u.pathname.replace("/v26.0/", "");
  const metric = u.searchParams.get("metric") ?? "";
  if (!u.searchParams.get("appsecret_proof")) return { error: { message: "sem proof", code: 100 } };
  if (u.searchParams.get("access_token") === "ruim") return { error: { message: "Invalid OAuth", code: 190 } };
  if (p === "me/accounts")
    return {
      data: [
        { name: "Página Cliente", instagram_business_account: { id: "1784000000000001", username: "cliente", followers_count: 6000, media_count: 300 } },
        { name: "Página sem IG" },
      ],
    };
  if (p === "1784000000000001/media")
    return {
      data: [
        { id: "m1", media_product_type: "REELS", media_type: "VIDEO", timestamp: new Date(Date.now() - 3 * 864e5).toISOString(), comments_count: 3, like_count: 40, caption: "Reel" },
        { id: "m2", media_product_type: "FEED", media_type: "CAROUSEL_ALBUM", timestamp: new Date(Date.now() - 10 * 864e5).toISOString(), comments_count: 5, like_count: 60 },
      ],
    };
  if (p === "m1/insights") {
    if (metric.includes("reels_skip_rate")) return { error: { message: "metric em desenvolvimento", code: 100 } };
    return { data: [{ name: "views", values: [{ value: 800 }] }, { name: "reach", values: [{ value: 600 }] }, { name: "shares", values: [{ value: 4 }] }] };
  }
  if (p === "m2/insights")
    return { data: [{ name: "views", values: [{ value: 1200 }] }, { name: "reach", values: [{ value: 900 }] }, { name: "saved", values: [{ value: 12 }] }] };
  if (p === "1784000000000001/insights") {
    if (u.searchParams.get("metric_type") === "time_series")
      return { data: [{ name: "reach", values: [{ value: 100, end_time: "2026-10-24T07:00:00+0000" }] }] };
    if (metric === "reach")
      return { data: [{ name: "reach", total_value: { value: 5000, breakdowns: [{ dimension_keys: ["follow_type"], results: [{ dimension_values: ["FOLLOWER"], value: 3000 }, { dimension_values: ["NON_FOLLOWER"], value: 2000 }] }] } }] };
    if (metric === "views" && u.searchParams.get("breakdown")) return { error: { message: "breakdown inválido", code: 100 } };
    return { data: metric.split(",").map((n) => ({ name: n, total_value: { value: 10 } })) };
  }
  if (p === "m1") return { id: "m1", username: "cliente", permalink: "https://instagram.com/p/m1", comments_count: 2 };
  if (p === "m1/comments")
    return {
      data: [
        { id: "c1", text: "Quanto custa?", username: "lead", replies: { data: [{ username: "cliente", text: "Te chamei na DM" }] } },
        { id: "c2", text: "👏", username: "time" },
      ],
    };
  if (p === "9999") {
    return {
      business_discovery: {
        username: "concorrente", followers_count: 1000, media_count: 50,
        media: { data: [{ id: "x1", media_product_type: "REELS", like_count: 30, comments_count: 2, view_count: 900, timestamp: new Date().toISOString() }] },
      },
    };
  }
  return { error: { message: `rota não simulada: ${p}`, code: 803 } };
}

globalThis.fetch = (async (input: any) => {
  const u = new URL(typeof input === "string" ? input : input.url);
  chamadas.push(u.pathname + "?" + u.searchParams.get("metric"));
  const body = resposta(u);
  return new Response(JSON.stringify(body), { status: body.error ? 400 : 200, headers: { "content-type": "application/json" } });
}) as any;

const post = (body: any, segredo = "s3cr3t", e: any = env) =>
  worker.fetch(new Request(`https://x.workers.dev/mcp/${segredo}`, { method: "POST", body: JSON.stringify(body) }), e);
const call = async (name: string, args: any = {}, e: any = env) => {
  const r = await (await post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, "s3cr3t", e)).json();
  if (r.result.isError) return { erro: r.result.content[0].text };
  return JSON.parse(r.result.content[0].text);
};
let falhas = 0;
const ok = (cond: any, msg: string) => {
  console.log(cond ? "ok  " : "FALHOU", msg);
  if (!cond) falhas++;
};

ok((await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, "errado")).status === 404, "segredo errado → 404");
const init = await (await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json();
ok(init.result.protocolVersion === "2025-06-18" && init.result.capabilities.tools, "initialize");
ok((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).status === 202, "notificação → 202");
const lista = await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
ok(lista.result.tools.length === 8, `tools/list (${lista.result.tools.length} ferramentas)`);

const contas = await call("ig_contas");
ok(contas.contas.length === 1 && contas.contas[0].username === "cliente", "ig_contas filtra páginas sem IG");

const posts = await call("ig_posts", { conta: "@cliente", limite: 2 });
ok(posts.posts[0].insights.views === 800 && posts.posts[0].insights._aviso, "ig_posts: fallback de métricas do Reel");
ok(posts.posts[1].insights.saved === 12 && posts.posts[1].idade_dias === 10, "ig_posts: insights do feed e idade");
ok(posts.resumo.mediana_views_reels === 800, "ig_posts: resumo com mediana");

const ins = await call("ig_insights_conta", { conta: "1784000000000001", dias: 90 });
ok(ins.janela_dias === 30, "ig_insights_conta limita a 30 dias");
ok(ins.alcance.reach_por_follow_type.NON_FOLLOWER === 2000, "alcance por seguidor / não seguidor");
ok(ins.views.views === 10, "views com fallback sem breakdown");
ok(ins.alcance_diario[0].dia === "2026-10-24", "alcance diário");

const com = await call("ig_comentarios", { post_id: "m1" });
ok(com.respondidos_pela_marca === 1 && com.de_terceiros === 2, "ig_comentarios marca respostas da marca");

const conc = await call("ig_concorrente", { username: "@concorrente" }, { ...env, DEFAULT_IG_USER_ID: "9999" });
ok(conc.perfil.followers_count === 1000 && conc.resumo.mediana_engajamento_por_seguidores_pct === 3.2, "ig_concorrente via Business Discovery");

const semConta = await call("ig_posts", { conta: "@naoexiste" });
ok(String(semConta.erro).includes("ig_concorrente"), "conta inacessível orienta para ig_concorrente");

const ruim = await call("ig_contas", {}, { ...env, META_TOKEN: "ruim" });
ok(String(ruim.erro).includes("190") && String(ruim.erro).includes("token"), "erro 190 com dica de token");

console.log(`\n${falhas ? falhas + " falha(s)" : "todos os testes passaram"} · ${chamadas.length} chamadas simuladas`);
process.exit(falhas ? 1 : 0);
