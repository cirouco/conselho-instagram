import { Graph, GraphError, idadeDias, mediana, pool, type Env } from "./meta.ts";

type Args = Record<string, any>;
interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  run: (g: Graph, env: Env, args: Args) => Promise<any>;
}

const MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count,is_comment_enabled";

const INSIGHTS: Record<string, string[]> = {
  REELS: [
    "views",
    "reach",
    "likes",
    "comments",
    "saved",
    "shares",
    "total_interactions",
    "ig_reels_avg_watch_time",
    "ig_reels_video_view_total_time",
    "reels_skip_rate",
  ],
  FEED: ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions", "profile_visits", "follows"],
  STORY: ["views", "reach", "replies", "shares", "total_interactions", "navigation", "follows", "profile_visits"],
};
const INSIGHTS_MINIMO = ["views", "reach", "saved", "shares", "total_interactions"];

const contaSchema = {
  type: "string",
  description: "ID da conta do Instagram ou @username (de uma conta a que o token tem acesso). Use ig_contas para listar.",
};

// ---------- auxiliares ----------

async function listarContas(g: Graph): Promise<any[]> {
  const pages = await g.list(
    "me/accounts",
    { fields: "name,instagram_business_account{id,username,name,followers_count,media_count}", limit: 100 },
    500,
  );
  return pages
    .filter((p) => p.instagram_business_account)
    .map((p) => ({ pagina: p.name, ...p.instagram_business_account }));
}

async function resolverConta(g: Graph, conta: string | undefined): Promise<{ id: string; username?: string }> {
  if (!conta) throw new Error("Informe a conta (ID ou @username).");
  const c = String(conta).trim().replace(/^@/, "");
  if (/^\d{6,}$/.test(c)) return { id: c };
  const contas = await listarContas(g);
  const achada = contas.find((x) => String(x.username).toLowerCase() === c.toLowerCase());
  if (!achada)
    throw new Error(
      `A conta @${c} não está entre as contas acessíveis pelo token. Para perfis de terceiros, use ig_concorrente.`,
    );
  return { id: achada.id, username: achada.username };
}

function lerInsights(data: any[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const m of data ?? []) {
    if (m.total_value !== undefined) {
      const tv = m.total_value;
      out[m.name] = tv.value ?? null;
      for (const b of tv.breakdowns ?? []) {
        const dim = (b.dimension_keys ?? []).join("+");
        const por: Record<string, number> = {};
        for (const r of b.results ?? []) por[(r.dimension_values ?? []).join("+")] = r.value;
        out[`${m.name}_por_${dim}`] = por;
      }
    } else if (Array.isArray(m.values)) {
      out[m.name] = m.values.length === 1 ? m.values[0].value : m.values;
    }
  }
  return out;
}

async function insightsDoPost(g: Graph, media: any): Promise<Record<string, any>> {
  const tipo =
    media.media_product_type === "REELS" ? "REELS" : media.media_product_type === "STORY" ? "STORY" : "FEED";
  try {
    const r = await g.get(`${media.id}/insights`, { metric: INSIGHTS[tipo].join(",") });
    return lerInsights(r.data);
  } catch (e) {
    try {
      const r = await g.get(`${media.id}/insights`, { metric: INSIGHTS_MINIMO.join(",") });
      return { ...lerInsights(r.data), _aviso: "métricas reduzidas: a API recusou parte das métricas deste post" };
    } catch (e2) {
      return { _erro: (e2 as Error).message };
    }
  }
}

function resumoPosts(posts: any[]) {
  const reels = posts.filter((p) => p.media_product_type === "REELS");
  const pick = (arr: any[], k: string) => arr.map((p) => p.insights?.[k] ?? p[k]).filter((v) => typeof v === "number");
  return {
    total: posts.length,
    reels: reels.length,
    mediana_views_reels: mediana(pick(reels, "views")),
    mediana_alcance: mediana(pick(posts, "reach")),
    mediana_compartilhamentos: mediana(pick(posts, "shares")),
    mediana_salvamentos: mediana(pick(posts, "saved")),
    mediana_comentarios: mediana(posts.map((p) => p.comments_count).filter((v) => typeof v === "number")),
    aviso:
      "Compare posts na mesma idade (campo idade_dias). Views incluem mídia paga quando o post foi impulsionado.",
  };
}

function janela(dias: number) {
  const d = Math.max(1, Math.min(30, Math.floor(dias || 30)));
  const until = Math.floor(Date.now() / 1000);
  return { dias: d, since: until - d * 86400, until };
}

async function tentar<T>(fn: () => Promise<T>): Promise<T | { _erro: string }> {
  try {
    return await fn();
  } catch (e) {
    return { _erro: (e as Error).message };
  }
}

// ---------- ferramentas ----------

export const TOOLS: Tool[] = [
  {
    name: "ig_contas",
    description:
      "Lista as contas profissionais do Instagram que o token da Meta pode acessar (clientes e a própria agência), com ID, @, seguidores e número de posts.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async (g) => ({ contas: await listarContas(g) }),
  },
  {
    name: "ig_perfil",
    description: "Dados do perfil de uma conta acessível: nome, bio, site, seguidores, seguindo, número de posts.",
    inputSchema: { type: "object", properties: { conta: contaSchema }, required: ["conta"], additionalProperties: false },
    run: async (g, _env, a) => {
      const { id } = await resolverConta(g, a.conta);
      return g.get(id, { fields: "id,username,name,biography,website,followers_count,follows_count,media_count" });
    },
  },
  {
    name: "ig_posts",
    description:
      "Últimos posts de uma conta acessível com métricas privadas: views, alcance, salvamentos, compartilhamentos, interações e, nos Reels, tempo médio de exibição e taxa de pulo. Inclui a idade de cada post e um resumo com medianas.",
    inputSchema: {
      type: "object",
      properties: {
        conta: contaSchema,
        limite: { type: "integer", minimum: 1, maximum: 50, default: 24, description: "Quantidade de posts (1–50)." },
        com_insights: { type: "boolean", default: true, description: "Buscar métricas privadas de cada post." },
      },
      required: ["conta"],
      additionalProperties: false,
    },
    run: async (g, _env, a) => {
      const { id } = await resolverConta(g, a.conta);
      const limite = Math.max(1, Math.min(50, a.limite ?? 24));
      const posts = await g.list(`${id}/media`, { fields: MEDIA_FIELDS, limit: Math.min(limite, 50) }, limite);
      const agora = Date.now();
      const enriquecidos = await pool(posts, 5, async (p) => ({
        ...p,
        caption: p.caption ? String(p.caption).slice(0, 400) : p.caption,
        idade_dias: idadeDias(p.timestamp, agora),
        insights: a.com_insights === false ? undefined : await insightsDoPost(g, p),
      }));
      return { coletado_em: new Date(agora).toISOString(), resumo: resumoPosts(enriquecidos), posts: enriquecidos };
    },
  },
  {
    name: "ig_insights_conta",
    description:
      "Métricas da conta nos últimos N dias (máximo 30): alcance (seguidores vs não seguidores), views, contas engajadas, interações, compartilhamentos, salvamentos, toques em links do perfil, seguidores ganhos e perdidos, e alcance diário.",
    inputSchema: {
      type: "object",
      properties: {
        conta: contaSchema,
        dias: { type: "integer", minimum: 1, maximum: 30, default: 30, description: "Janela em dias (1–30)." },
      },
      required: ["conta"],
      additionalProperties: false,
    },
    run: async (g, _env, a) => {
      const { id } = await resolverConta(g, a.conta);
      const { dias, since, until } = janela(a.dias ?? 30);
      const base = { period: "day", since, until };
      const tv = { ...base, metric_type: "total_value" };
      const [alcance, views, totais, seguidores, diario] = await Promise.all([
        tentar(async () => lerInsights((await g.get(`${id}/insights`, { ...tv, metric: "reach", breakdown: "follow_type" })).data)),
        tentar(async () => {
          try {
            return lerInsights((await g.get(`${id}/insights`, { ...tv, metric: "views", breakdown: "follower_type" })).data);
          } catch {
            return lerInsights((await g.get(`${id}/insights`, { ...tv, metric: "views" })).data);
          }
        }),
        tentar(async () =>
          lerInsights(
            (
              await g.get(`${id}/insights`, {
                ...tv,
                metric: "accounts_engaged,total_interactions,shares,saves,likes,comments,profile_links_taps",
              })
            ).data,
          ),
        ),
        tentar(async () =>
          lerInsights((await g.get(`${id}/insights`, { ...tv, metric: "follows_and_unfollows", breakdown: "follow_type" })).data),
        ),
        tentar(async () => {
          const r = await g.get(`${id}/insights`, { ...base, metric: "reach", metric_type: "time_series" });
          return (r.data?.[0]?.values ?? []).map((v: any) => ({ dia: v.end_time?.slice(0, 10), alcance: v.value }));
        }),
      ]);
      return {
        conta: id,
        janela_dias: dias,
        aviso: "Dados podem ter até 48 h de atraso. follows_and_unfollows não é retornado para contas com menos de 100 seguidores.",
        alcance,
        views,
        totais,
        seguidores,
        alcance_diario: diario,
      };
    },
  },
  {
    name: "ig_publico",
    description: "Demografia dos seguidores de uma conta acessível: idade, gênero, cidade e país (top 45 por dimensão).",
    inputSchema: {
      type: "object",
      properties: {
        conta: contaSchema,
        periodo: { type: "string", enum: ["this_week", "this_month"], default: "this_month" },
      },
      required: ["conta"],
      additionalProperties: false,
    },
    run: async (g, _env, a) => {
      const { id } = await resolverConta(g, a.conta);
      const out: Record<string, any> = { conta: id };
      for (const dim of ["age", "gender", "city", "country"]) {
        out[dim] = await tentar(async () =>
          lerInsights(
            (
              await g.get(`${id}/insights`, {
                metric: "follower_demographics",
                period: "lifetime",
                metric_type: "total_value",
                breakdown: dim,
                timeframe: a.periodo ?? "this_month",
              })
            ).data,
          ),
        );
      }
      return out;
    },
  },
  {
    name: "ig_stories",
    description: "Stories ativos (últimas 24 h) de uma conta acessível, com views, alcance, respostas, compartilhamentos e navegação.",
    inputSchema: { type: "object", properties: { conta: contaSchema }, required: ["conta"], additionalProperties: false },
    run: async (g, _env, a) => {
      const { id } = await resolverConta(g, a.conta);
      const stories = await g.list(`${id}/stories`, { fields: "id,media_type,timestamp,permalink" }, 50);
      const out = await pool(stories, 5, async (s) => ({
        ...s,
        insights: await insightsDoPost(g, { ...s, media_product_type: "STORY" }),
      }));
      return { total: out.length, stories: out };
    },
  },
  {
    name: "ig_comentarios",
    description:
      "Comentários de um post de conta acessível, com respostas, e indicação de quais foram respondidos pela própria marca. Use o ID do post vindo de ig_posts.",
    inputSchema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "ID do post (campo id em ig_posts)." },
        limite: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
      required: ["post_id"],
      additionalProperties: false,
    },
    run: async (g, _env, a) => {
      const post = await g.get(String(a.post_id), { fields: "id,username,permalink,comments_count" });
      const marca = String(post.username || "").toLowerCase();
      const comentarios = await g.list(
        `${a.post_id}/comments`,
        { fields: "id,text,username,timestamp,like_count,replies{id,text,username,timestamp}", limit: 50 },
        Math.max(1, Math.min(200, a.limite ?? 50)),
      );
      const lista = comentarios.map((c) => {
        const respostas = c.replies?.data ?? [];
        return {
          id: c.id,
          autor: c.username,
          texto: c.text,
          data: c.timestamp,
          curtidas: c.like_count,
          respondido_pela_marca: respostas.some((r: any) => String(r.username).toLowerCase() === marca),
          respostas: respostas.map((r: any) => ({ autor: r.username, texto: r.text, data: r.timestamp })),
        };
      });
      const daMarca = lista.filter((c) => String(c.autor).toLowerCase() !== marca);
      return {
        post: post.permalink,
        marca: post.username,
        total_comentarios: post.comments_count,
        lidos: lista.length,
        respondidos_pela_marca: daMarca.filter((c) => c.respondido_pela_marca).length,
        de_terceiros: daMarca.length,
        comentarios: lista,
      };
    },
  },
  {
    name: "ig_concorrente",
    description:
      "Dados públicos de qualquer perfil PROFISSIONAL do Instagram (concorrente) via Business Discovery: seguidores, posts, bio e os últimos posts com curtidas, comentários e views (views incluem pago). Não funciona para contas pessoais ou com restrição de idade. Curtidas podem vir ausentes se o perfil as oculta.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "@ do perfil (com ou sem @)." },
        limite: { type: "integer", minimum: 1, maximum: 50, default: 24 },
        via_conta: { type: "string", description: "Opcional: conta própria usada para a consulta (ID ou @)." },
      },
      required: ["username"],
      additionalProperties: false,
    },
    run: async (g, env, a) => {
      const alvo = String(a.username).trim().replace(/^@/, "");
      let via = a.via_conta ? (await resolverConta(g, a.via_conta)).id : env.DEFAULT_IG_USER_ID;
      if (!via) {
        const contas = await listarContas(g);
        if (!contas.length) throw new Error("Nenhuma conta própria acessível para fazer o Business Discovery.");
        via = contas[0].id;
      }
      const limite = Math.max(1, Math.min(50, a.limite ?? 24));
      const campos =
        `business_discovery.username(${alvo}){username,name,biography,website,followers_count,follows_count,media_count,` +
        `media.limit(${limite}){id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count,view_count}}`;
      const r = await g.get(String(via), { fields: campos });
      const bd = r.business_discovery ?? {};
      const agora = Date.now();
      const posts = (bd.media?.data ?? []).map((p: any) => ({
        ...p,
        caption: p.caption ? String(p.caption).slice(0, 400) : p.caption,
        idade_dias: idadeDias(p.timestamp, agora),
      }));
      const reels = posts.filter((p: any) => p.media_product_type === "REELS");
      const seg = bd.followers_count || 0;
      const eng = posts
        .filter((p: any) => typeof p.like_count === "number")
        .map((p: any) => ((p.like_count + (p.comments_count || 0)) / (seg || 1)) * 100);
      delete bd.media;
      return {
        coletado_em: new Date(agora).toISOString(),
        perfil: bd,
        resumo: {
          posts_lidos: posts.length,
          mediana_views_reels: mediana(reels.map((p: any) => p.view_count)),
          mediana_comentarios: mediana(posts.map((p: any) => p.comments_count)),
          mediana_engajamento_por_seguidores_pct: mediana(eng),
          aviso:
            "Engajamento = (curtidas + comentários) ÷ seguidores, por post (mesma fórmula da Socialinsider). Views incluem pago. Compare na mesma idade.",
        },
        posts,
      };
    },
  },
];

export async function runTool(env: Env, name: string, args: Args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Ferramenta desconhecida: ${name}`);
  const g = new Graph(env);
  try {
    return await tool.run(g, env, args ?? {});
  } catch (e) {
    if (e instanceof GraphError) {
      const dica =
        e.code === 190
          ? " (token inválido ou expirado: gere um novo token do Usuário do Sistema)"
          : e.code === 10 || e.code === 200
            ? " (permissão ausente: confira instagram_basic, instagram_manage_insights e pages_read_engagement, e se a conta foi atribuída ao Usuário do Sistema)"
            : e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613
              ? " (limite de chamadas da Meta atingido: aguarde alguns minutos)"
              : "";
      throw new Error(`Erro da Meta${e.code ? ` ${e.code}` : ""}: ${e.message}${dica}`);
    }
    throw e;
  }
}
