## Alcance
- Alinhar todas as ferramentas para enviar o modelo exatamente como escolhido no frontend (GPT‑4o, Claude 3.7 Sonnet, Gemini 2.5 Pro), usando o provedor principal (laozhang) quando “usar créditos” ou “default admin” estiver ativo.
- Abranger: Títulos virais, Thumbnails, Explorar Nicho, Competidor, Análise de Transcrição, Gerador de Cenas, Gerador de Roteiro/Agentes.

## Abstração Comum (Backend)
- Criar util: `resolveProviderAndModel(userId, requestedModel)`
  - Entrada: `userId`, `requestedModel`.
  - Saída: `{ service: 'laozhang'|'openai'|'claude'|'gemini', apiKey, modelForAPI, displayModel }`.
  - Regras:
    - Se `laozhang_use_as_default` (admin) ou `use_credits_instead_of_own_api` (usuário), retornar `service='laozhang'` e `modelForAPI` normalizado para um dos três nomes aceitos (gpt-4o, claude-3-7-sonnet-20250219, gemini-2.5-pro).
    - Caso contrário, usar API própria do usuário com o modelo solicitado.
  - Onde colocar: Backend/server.js (próximo de `callLaozhangAPI(...)`).

## Ferramentas a ajustar (Backend)
- **Thumbnails**: `app.post('/api/analyze/thumbnail' ...)` em Backend/server.js:12566.
  - Usar `resolveProviderAndModel` e chamar laozhang quando aplicável.
  - Remover qualquer chamada auxiliar extra (tradução ou validação) que gere segunda requisição.
  - Variante laozhang: `app.post('/api/analyze/thumbnail/laozhang' ...)` em Backend/server.js:13577 já encaminha — validar mapeamento de `selectedModel`.
- **Explorar Nicho**:
  - `app.post('/api/niche/find-subniche' ...)` em Backend/server.js:21357.
  - `app.post('/api/niche/analyze-competitor' ...)` em Backend/server.js:21535.
  - Em ambas, aplicar `resolveProviderAndModel` e encaminhar para laozhang com `modelForAPI` normalizado quando créditos/default.
- **Análise de Transcrição**:
  - `app.post('/api/video/transcript/analyze' ...)` em Backend/server.js:16547.
  - Incluir `resolveProviderAndModel`; quando laozhang ativo, enviar uma única chamada por análise (sem segunda requisição separada).
- **Gerador de Cenas**:
  - `app.post('/api/generate/scene-prompts' ...)` em Backend/server.js:13910.
  - Encaminhar via `resolveProviderAndModel`; normalizar `selectedModel` se vier do frontend.
- **Gerador de Roteiro**:
  - Endpoints listados em Backend/server.js:2398–2404 e 5983–5987 (inclui `/api/scripts/generate`).
  - Garantir uso do provedor principal quando créditos/default, com `modelForAPI` normalizado.

## Frontend
- Em `dashboard.html`:
  - Títulos: já usa `/api/analyze/titles/laozhang` quando status laozhang ativo (Backend/dashboard.html:11039–11041). Replicar padrão nas seções:
    - Thumbnails (envio: 10970+): usar endpoint `/api/analyze/thumbnail/laozhang` quando laozhang ativo e enviar `model` normalizado.
    - Explorar nicho: blocos em Backend/dashboard.html:14169–14173 e 14258–14261 — quando status laozhang, usar os endpoints `/laozhang` e enviar `selectedModel`/`model` normalizado.
    - Cenas/roteiro: usar `/api/generate/scene-prompts/laozhang` e variantes `/script-agents/.../laozhang` quando laozhang ativo.
  - Remover chamadas auxiliares que criem segunda requisição (como tradução isolada) e embutir necessidades no prompt principal, se quiser tradução.

## Etiquetagem e Exibição
- Manter `displayModel` igual ao modelo escolhido no frontend para cabeçalhos e badges.
- Para comparação (laozhang ativo): 3 chamadas (GPT‑4o, Claude 3.7, Gemini 2.5) e agregação de 5 títulos por modelo.

## Validação
- Fluxos únicos: Claude/Gemini/GPT com créditos ativo → uma chamada por ação, dashboard do provedor mostra 1 entrada por ação.
- Comparar: 3 chamadas (uma por modelo) e UI com 5 títulos por modelo.
- Testar Explorar Nicho, Competidor, Thumbnails, Cenas, Roteiro, Transcrição, confirmando etiquetas corretas e ausência de duplicidades.

## Observações
- Logs: adicionar logs leves “provider/model” por rota para auditoria e suporte.
- Segurança: não logar chaves.
- Performance: reusar a mesma resolução de provedor e normalização em todas as rotas para consistência e reduzir erros.