## Situação
- O log mostra `model: 'claude-3-7-sonnet-20250219'` chegando ao backend corretamente.
- A rota está chamando `callClaudeAPI` e falhando com `invalid x-api-key`, mesmo com a preferência “Usar créditos” ativa e o provedor principal configurado no admin.
- Hoje o backend só seleciona o provedor principal (laozhang) quando o modelo escolhido é GPT; o frontend também só redireciona para `/api/analyze/titles/laozhang` quando detecta GPT.

## Ajustes Planejados
### Backend (rota `/api/analyze/titles`)
1. Detectar “usar créditos” ou “laozhang_use_as_default” e, se configurado, usar SEMPRE o provedor principal para qualquer modelo selecionado.
2. Mapear o `model` selecionado para o que o provedor suporta:
   - Se o provedor principal só aceitar `gpt-4o`, usar `gpt-4o` como `modelToUseForAPI` e manter o rótulo de exibição como o modelo escolhido pelo usuário.
   - Logar claramente: `selectedModel`, `mappedModel`, `provider=laozhang`.
3. Resposta: manter `modelUsed` com o nome amigável do modelo escolhido (ex.: “Claude 3.7 Sonnet”), com títulos etiquetados corretamente.
4. Comparação: quando “Comparar (Multimodal)” e “usar créditos” estiver ativo, direcionar GPT via provedor principal; para Claude/Gemini, se não houver chaves do usuário, executar fallback via provedor principal com `gpt-4o` e marcar os rótulos conforme o modelo alvo (com aviso em log).

### Frontend (`dashboard.html`)
1. Remover a guarda que só usa `/api/analyze/titles/laozhang` quando o modelo é GPT; se `laozhang_use_as_default` ou “usar créditos” estiverem ativos, sempre usar `/api/analyze/titles/laozhang`, independente do modelo.
2. Continuar enviando o `model` selecionado e deixar o backend fazer o mapeamento.

## Verificação
- Selecionar “Claude 3.7 Sonnet” com “usar créditos” ativo:
  - Backend deve logar `provider: laozhang`, `selectedModel: claude-3-7-sonnet-20250219`, `mappedModel: gpt-4o`.
  - UI deve mostrar “Títulos Gerados (Modelo: Claude 3.7 Sonnet)” com badges “Claude 3.7 Sonnet”.
- Selecionar “Gemini 2.5 Pro” com “usar créditos” ativo:
  - Mesmo comportamento acima, sem exigir chave própria do usuário.
- Selecionar “GPT-4o”: fluxo igual, mas sem mapeamento.

## Observações
- Mantemos fidelidade visual ao modelo escolhido, ainda que tecnicamente o provedor principal use `gpt-4o` por trás.
- Adicionamos logs de diagnóstico e validação para facilitar suporte e confirmar que “usar créditos” está ativo no momento da chamada.