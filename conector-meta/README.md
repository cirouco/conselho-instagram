# Conector Meta → Claude (Instagram)

Servidor MCP **somente leitura** que liga o Claude à API oficial do Instagram usando o seu app da Meta (Instagram API com Facebook Login). Roda de graça no Cloudflare Workers e funciona no Claude web, desktop e celular.

## Ferramentas

| Ferramenta | O que traz | Para quais contas |
|---|---|---|
| `ig_contas` | Contas do Instagram que o token acessa, com ID, @, seguidores, posts | Suas e dos clientes |
| `ig_perfil` | Bio, site, seguidores, seguindo, número de posts | Suas e dos clientes |
| `ig_posts` | Últimos posts com views, alcance, salvamentos, compartilhamentos, interações; nos Reels, tempo médio e taxa de pulo; idade de cada post; medianas | Suas e dos clientes |
| `ig_insights_conta` | Até 30 dias: alcance (seguidores × não seguidores), views, contas engajadas, toques em links, seguidores ganhos e perdidos, alcance diário | Suas e dos clientes |
| `ig_publico` | Demografia dos seguidores (idade, gênero, cidade, país) | Suas e dos clientes |
| `ig_stories` | Stories ativos com views, alcance, respostas, navegação | Suas e dos clientes |
| `ig_comentarios` | Comentários e respostas de um post, marcando os respondidos pela marca | Suas e dos clientes |
| `ig_concorrente` | Perfil e últimos posts de qualquer conta **profissional** (curtidas, comentários, views) via Business Discovery | Concorrentes |

Nenhuma ferramenta publica, apaga, responde ou altera nada.

## Passo 1 — Token da Meta (Usuário do Sistema)

O token de Usuário do Sistema não expira e dá acesso só às contas que você atribuir a ele.

1. No **Meta Business Suite / Gerenciador de Negócios**, abra **Configurações do negócio → Usuários → Usuários do sistema** e crie um usuário do sistema (função Admin ou Funcionário).
2. Em **Atribuir ativos**, adicione as **Páginas do Facebook** ligadas às contas do Instagram (da agência e de cada cliente) e as **contas do Instagram**, com permissão para ver desempenho/insights.
   - Contas de clientes precisam estar compartilhadas com o seu Gerenciador de Negócios (como parceiro).
3. Confirme que o seu app está ligado ao mesmo Gerenciador de Negócios (**Contas → Apps**).
4. No usuário do sistema, clique em **Gerar token**, escolha o app, expiração **Nunca** e as permissões:
   - `instagram_basic`
   - `instagram_manage_insights`
   - `pages_read_engagement`
   - `pages_show_list`
   - `business_management`
5. Copie o token e guarde em lugar seguro. Ele não vai para o código; entra só como segredo no passo 2.
6. Anote também a **Chave secreta do app** (Painel do app → Configurações → Básico). Ela assina as chamadas (`appsecret_proof`).

Se o `ig_concorrente` der erro de permissão, o app pode precisar de **Acesso Avançado** a `instagram_basic` e `pages_read_engagement` (Painel do app → Revisão do app).

## Passo 2 — Publicar no Cloudflare (5 minutos)

Precisa de Node.js 20+ e de uma conta gratuita no Cloudflare. No terminal, dentro desta pasta:

```bash
npm install
npx wrangler login                    # abre o navegador para entrar no Cloudflare
npx wrangler secret put META_TOKEN    # cole o token do Usuário do Sistema
npx wrangler secret put META_APP_SECRET   # cole a chave secreta do app
openssl rand -hex 32                  # gera um segredo aleatório; copie o resultado
npx wrangler secret put CONNECTOR_SECRET  # cole o segredo gerado
npx wrangler deploy
```

O deploy mostra o endereço do Worker, algo como `https://conector-meta-instagram.SEU-SUBDOMINIO.workers.dev`.

Teste: abra `https://.../health` no navegador; deve aparecer `{"ok":true,...}`.

Opcional: em `wrangler.toml`, preencha `DEFAULT_IG_USER_ID` com o ID da conta do Instagram da agência (veja em `ig_contas`) para as consultas de concorrentes saírem dela.

## Passo 3 — Ligar no Claude

Em **Configurações → Conectores**, adicione um **conector personalizado** com a URL:

```
https://conector-meta-instagram.SEU-SUBDOMINIO.workers.dev/mcp/SEU_CONNECTOR_SECRET
```

Depois peça, por exemplo: "liste minhas contas do Instagram" ou "audita o @cliente" (a skill *Conselho Instagram* usa o conector automaticamente).

## Segurança

- **A URL com o segredo é a chave.** Quem tiver a URL lê os dados de todas as contas atribuídas ao Usuário do Sistema. Não compartilhe nem cole em lugar público.
- Para revogar: rode `npx wrangler secret put CONNECTOR_SECRET` com um valor novo e atualize a URL no Claude. Para cortar tudo, remova o token no Gerenciador de Negócios.
- O token só tem permissões de leitura. Ainda assim, atribua ao Usuário do Sistema apenas as contas necessárias.
- O `META_APP_SECRET` faz o servidor assinar cada chamada; com ele ativado, um token vazado sozinho não basta.

## Limites da API

- Dados de conta podem ter até 48 h de atraso; janelas de no máximo 30 dias por consulta.
- `impressions` foi descontinuada em 2025; o conector usa `views`.
- Algumas métricas (views, taxa de pulo, interações totais) estão marcadas pela Meta como "em desenvolvimento". Quando a API recusa alguma, o conector volta para um conjunto mínimo e avisa.
- Business Discovery só funciona para contas profissionais, não traz contas com restrição de idade, e `view_count` inclui views pagas.
- Limite de chamadas da Meta: se aparecer erro 4/17/32/613, aguarde alguns minutos.

Referências: [métricas por post](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/) · [métricas da conta](https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights) · [Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery)

## Desenvolvimento

```bash
npm test          # testes com a API da Meta simulada
npm run typecheck
npm run dev       # servidor local (use um arquivo .dev.vars com os segredos)
```
