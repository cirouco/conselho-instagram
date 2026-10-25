# Conselho Instagram

Um agente (skill do Claude) que audita perfis do Instagram com um conselho de **16 especialistas** e um **revisor cético**. Cada especialista analisa o mesmo perfil por uma ótica diferente, e o coordenador junta tudo em:

- **Score do Instagram (0–100)** com pesos fixos, para comparar perfis e acompanhar a evolução
- **Diagnóstico** com consenso, contradições entre lentes e decisões
- **Quick wins de 7 dias** e **plano de 90 dias** ordenado por retorno (impacto ÷ esforço)
- **Entregas prontas**: ganchos reescritos, roteiros de Reels, carrosséis slide a slide, bios, isca e funil, calendário comercial, matriz de criativos, padrão de atendimento
- **Relatório para o cliente** e **registro em planilha de histórico**

Feito em português do Brasil, com atenção ao mercado brasileiro (WhatsApp, calendário comercial, LGPD, CONAR, CDC).

## As 16 lentes

| # | Lente | Peso | Inspirada em |
|---|---|---|---|
| 1 | Algoritmo | 10 | Explicações públicas de Adam Mosseri (Instagram) |
| 2 | Dados e benchmarks | 9 | Estudos de mercado (Rival IQ, Socialinsider, Hootsuite, HypeAuditor) e marketing baseado em dados (Rafael Kiso) |
| 3 | Ganchos | 7 | *Hook Point*, Brendan Kane |
| 4 | Roteiro e retenção | 7 | Método de vídeo curto de Kallaway |
| 5 | Oferta e funil | 8 | *$100M Leads* e *$100M Offers*, Alex Hormozi |
| 6 | Atenção e volume | 5 | Modelo de conteúdo de Gary Vaynerchuk |
| 7 | Posicionamento | 9 | *This Is Marketing* e *Purple Cow*, Seth Godin |
| 8 | Autoridade e design | 5 | Chris Do / The Futur |
| 9 | Marca e cultura | 4 | Rachel Karten (*Link in Bio*) |
| 10 | Negócio local e conversão | 7 | Jasmine Star |
| 11 | Collabs e influência | 4 | *The Age of Influence*, Neal Schaffer |
| 12 | Prontidão para mídia paga | 5 | Diretrizes da Meta (Andromeda, Advantage+) |
| 13 | Vendas e mercado brasileiro | 6 | *Instagram Marketing*, Rafael Terra |
| 14 | Voz do cliente | 7 | Pesquisa qualitativa / voice of customer |
| 15 | Atendimento e experiência | 5 | Social care; *Hug Your Haters*, Jay Baer |
| 16 | Risco e conformidade | 2 (+ alerta) | CONAR, SPA/SECAP, CDC, LGPD, direitos autorais |

As lentes são **inspiradas nos métodos públicos** dessas referências. O agente nunca fala em nome delas nem atribui frases a elas. Este projeto não tem relação com essas pessoas ou empresas.

**Faixas do score:** 0–39 Crítico · 40–59 Fraco · 60–74 Em construção · 75–89 Forte · 90–100 Referência. Qualquer infração legal grave encontrada pela lente 16 vai para o topo do relatório e marca o score "com alerta legal".

## Como funciona

1. **Coleta** — conector de Instagram/Insights se houver; ferramentas internas da agência (anúncios, CRM, conversas) se houver; perfil público, concorrentes e Biblioteca de Anúncios pelo navegador; prints do usuário para o que faltar.
2. **Dossiê** — um conjunto único de fatos e métricas, para que todas as lentes analisem a mesma coisa.
3. **Conselho** — as 16 lentes rodam em paralelo (subagentes), cada uma com nota, críticas com evidência, acertos, recomendações com impacto/esforço e uma entrega específica.
4. **Confronto** — consenso (4 ou mais lentes), contradições resolvidas pelo objetivo do perfil e ordenação por retorno.
5. **Score** — nota × peso ÷ 10, somado.
6. **Revisão cética** — um subagente que não participou da análise ataca o relatório (contas, evidências, contradições, planos impossíveis, dados pessoais) antes da entrega.
7. **Relatório** — 20 seções, documento para o cliente e resumo de 1 página.
8. **Histórico** — uma linha por auditoria numa planilha, para reauditorias.

Toda afirmação é marcada como **[Dado]** (visto ou medido) ou **[Hipótese]** (inferência, com a forma de confirmar). O agente não inventa métricas.

## Modos

- `audita o @perfil` — auditoria completa
- `reaudita o @perfil` — compara com a última auditoria do histórico
- `calibra o conselho com estes perfis: ...` — você informa 5 perfis fortes e 5 fracos; o conselho audita todos e propõe ajustes de régua onde errou

## Instalação

O agente é uma única pasta com o arquivo `SKILL.md`.

- **Claude Code:** copie a pasta para `~/.claude/skills/conselho-instagram/` (ou `.claude/skills/` dentro de um projeto).
- **Claude (app):** compacte a pasta em .zip e envie como skill personalizada nas configurações de skills.

Funciona melhor com: ferramenta de subagentes (para rodar as lentes em paralelo), navegador (para ler o perfil e a Biblioteca de Anúncios; o Instagram exige login para abrir posts) e um conector de documentos e de planilhas para o relatório e o histórico.

## Estrutura

```
SKILL.md                 o agente
templates/historico.csv  cabeçalho da planilha de histórico
templates/relatorio.md   esqueleto das 20 seções do relatório
docs/metodologia.md      fontes e premissas das lentes (revalidar a cada trimestre)
```

## Limites

- Sem os Insights da conta (só o dono vê), a confiança fica em média ou baixa: alcance, % não seguidores, envios e tempo de exibição não são públicos.
- Benchmarks de mercado mudam todo ano e usam fórmulas diferentes; o agente é instruído a revalidar e citar a fórmula de cada fonte.
- A lente de Risco é uma triagem de marketing e **não substitui parecer jurídico**.
- Regras e sinais da plataforma mudam; o agente busca a informação atual antes de afirmar algo sobre o Instagram.

## Licença

MIT. Veja `LICENSE`.
