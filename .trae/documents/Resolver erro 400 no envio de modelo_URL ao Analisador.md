## Diagnóstico
- O backend retorna 400 "URL do vídeo e modelo de IA são obrigatórios" na rota `/api/analyze/titles`, indicando `req.body` sem `videoUrl` ou `model`.
- O frontend envia `{ videoUrl, model, folderId }`, mas a seleção de endpoint e o parse podem estar causando corpo vazio ou campo com nome alternativo.

## Ajustes Planejados
### Backend
1. Adicionar log defensivo no início de `/api/analyze/titles` para imprimir `typeof req.body`, e os campos `videoUrl`, `model`, `selectedModel`.
2. Aceitar fallback `selectedModel` se `model` vier vazio: `const effectiveModel = req.body.model || req.body.selectedModel`.
3. Sanitizar o modelo: garantir string e podar espaços.
4. Manter a lógica que só usa o provedor externo quando `effectiveModel` é GPT.

### Frontend
1. Validar antes de enviar: se `videoUrl` ou `model` estiver vazio, bloquear e mostrar mensagem.
2. Garantir que `endpoint` só troca para `/laozhang` quando `model` é GPT (já ajustado), adicionando guarda `typeof model === 'string'`.

## Verificação
- Testar com "Claude 3.7 Sonnet", "Gemini 2.5 Pro" e "GPT-4o".
- Confirmar que não ocorre 400; logs mostram `videoUrl` e `effectiveModel` preenchidos.
- UI exibe cabeçalho e badges com o provedor correto.

## Observação
- Logs são temporários, apenas para diagnóstico. Remover após confirmar estabilidade.