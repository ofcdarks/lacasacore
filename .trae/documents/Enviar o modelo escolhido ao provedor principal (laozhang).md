## Objetivo
- Garantir que, quando “Usar créditos” ou provedor principal estiver ativo, todas as requisições sejam enviadas ao laozhang com o modelo exatamente como escolhido no frontend (GPT‑4o, Claude 3.7 Sonnet, Gemini 2.5 Pro), sem forçar `gpt-4o`.

## Ajustes no Backend
- Rota `POST /api/analyze/titles` (modelo único):
  - Quando `laozhang_use_as_default` ou “usar créditos” estiver ativo, usar SEMPRE laozhang.
  - Mapear o `model` recebido para nomes válidos da laozhang: `gpt-4o`, `claude-3-7-sonnet-20250219`, `gemini-2.5-pro`. Não sobrescrever para `gpt-4o`.
  - Passar `modelToUseForAPI` diretamente para `callLaozhangAPI(...)` e manter `modelUsed` com o nome amigável do modelo escolhido.
  - Locais: Backend/server.js:11654–11682 (reverter a forçagem atual para `gpt-4o`), 11724–11741 (garantir `response.titles || response` e etiqueta).
- Rota `POST /api/analyze/titles/laozhang`:
  - Usar `requestedModel` do body, normalizar para os três nomes aceitos e enviar sem alteração para `callLaozhangAPI` (já está próximo disso, confirmar em Backend/server.js:11954–11963, 12088–12098).
- Função `callLaozhangAPI(...)`:
  - Manter fallback para `gpt-4o` apenas quando `model` estiver ausente; não alterar o `model` quando for fornecido.
  - Logar claramente: `selectedModel`, `modelToUse` e endpoint.

## Ajustes no Frontend
- `dashboard.html` (envio modelo único):
  - Sempre enviar `model: normalizedModel` e usar `/api/analyze/titles/laozhang` quando laozhang estiver ativo, independentemente do modelo (já parcialmente feito em Backend/dashboard.html:11039–11041 e 11176–11187; confirmar que nunca envia `null`).
- Modo “Comparar (Multimodal)”:
  - Quando laozhang ativo, disparar 3 requisições para `/api/analyze/titles/laozhang` com os três modelos: `gpt-4o`, `claude-3-7-sonnet-20250219`, `gemini-2.5-pro` (já é isso no código; validar que o endpoint é o de laozhang quando ativo).

## Validação
- Selecionar “Claude 3.7 Sonnet (Fev/25)” com créditos ativos:
  - Logs devem mostrar `provider: laozhang`, `selectedModel: claude-3-7-sonnet-20250219`, sem erro de Anthropic.
  - UI deve exibir cabeçalho e badges “Claude 3.7 Sonnet”.
- Selecionar “Gemini 2.5 Pro (2025)” com créditos ativos:
  - Logs com `provider: laozhang`, `selectedModel: gemini-2.5-pro`.
- Selecionar “Comparar (Multimodal)” com créditos ativos:
  - 3 chamadas no laozhang, 5 títulos por modelo, cada badge com sua etiqueta.

## Observação
- Mantemos os rótulos de modelo exatamente iguais ao que o usuário escolheu; somente o provedor (laozhang) roteia internamente conforme o modelo enviado.