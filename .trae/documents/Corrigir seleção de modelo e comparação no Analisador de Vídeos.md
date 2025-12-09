## Diagnóstico Rápido
- Ao gerar títulos, a UI exibe o modelo incorreto (“GPT”) e os títulos não carregam com uma etiqueta clara do provedor selecionado.
- A rota já aceita o `model` e suporta comparação paralela, mas o frontend não mostra o provedor por título e pode confundir o cabeçalho com um valor padrão.

## Onde está no código
- Backend (rota de títulos): `Nova pasta/Backend/server.js:2123`.
- Lógica de comparação (3 chamadas paralelas): `Nova pasta/Backend/server.js:2336–2370`.
- Inserção no histórico e retorno de `modelUsed`: `Nova pasta/Backend/server.js:2421–2541`.
- Frontend submit: `Nova pasta/Backend/dashboard.html:2712–2748`.
- Renderização do cabeçalho “Títulos Gerados (Modelo: ...)”: `Nova pasta/Backend/dashboard.html:3033–3040`.
- Lista de títulos (onde vamos exibir a etiqueta do provedor): `Nova pasta/Backend/dashboard.html:3046–3084`.
- Explorar Nicho (envio do modelo): `Nova pasta/Backend/dashboard.html:5179–5232` e rotas `Nova pasta/Backend/server.js:6391–6452`.
- Analisar Competidor (envio do modelo): `Nova pasta/Backend/dashboard.html:5234–5290` e rotas `Nova pasta/Backend/server.js:6454–6585`.

## Mudanças Planejadas
### Backend
- Comparar (multimodal): manter 3 chamadas paralelas e normalizar para 5 títulos por provedor.
  - Em `server.js:2354–2369`, aplicar `slice(0, 5)` em `parsedData.titulosSugeridos` para cada provedor antes de inserir em `allGeneratedTitles`.
- Etiquetagem por provedor: parar de prefixar o texto do título com `[Gemini]`, `[Claude]`, `[OpenAI]` e usar apenas o campo `model` para a etiqueta.
  - Em `server.js:2361–2363`, remover o prefixo, mantendo `{ ...t, model: serviceName }`.
- Modelo exibido: mapear `modelUsed` para nomes amigáveis.
  - Quando for único modelo, converter `claude-3-7-sonnet-20250219` → “Claude 3.7 Sonnet”, `gpt-4o` → “GPT-4o”, `gemini-2.5-pro` → “Gemini 2.5 Pro”.

### Frontend
- Cabeçalho: exibir corretamente o modelo usado.
  - Em `dashboard.html:3033–3040`, se `data.modelUsed === 'all'` ou contém “Comparação”, mostrar “Comparação (Gemini, Claude, OpenAI)”; caso contrário, mapear o id do modelo para nome amigável.
- Etiqueta por título: mostrar um badge compacto com o provedor ao lado da nota.
  - Em `dashboard.html:3046–3084`, renderizar um badge usando `titleObj.model` (Gemini/Claude/OpenAI ou id do modelo) e, se o texto vier com prefixo `[...]`, removê-lo só para exibição/cópia.
- Cópia e seleção: a cópia do título não deve levar o prefixo; já há limpeza ao salvar na biblioteca, manter coerência na UI.
- Garantir envio do modelo correto em todas as ferramentas (já está):
  - Títulos: `model-select` → `server.js:/api/analyze/titles`.
  - Thumbnails: `thumb-model-select` → `server.js:/api/analyze/thumbnail` (usa `parseAIResponse`).
  - Explorar Nicho: `niche-model-select` → `server.js:/api/niche/find-subniche`.
  - Competidor: `competitor-model-select` → `server.js:/api/niche/analyze-competitor`.

## Validação
- Fluxo Comparar: selecionar “Comparar (Multimodal)”, verificar retorno de 15 títulos total, com 5 badges para cada provedor (Gemini/Claude/OpenAI) e cabeçalho “Comparação (Gemini, Claude, OpenAI)”.
- Fluxos individuais: escolher `GPT-4o`, `Claude 3.7 Sonnet`, `Gemini 2.5 Pro` e confirmar que:
  - Cabeçalho mostra o nome correto do modelo.
  - Todos os títulos têm badge do provedor correto.
- Explorar Nicho e Competidor: enviar com cada modelo e validar que as respostas são geradas e não rotuladas como “GPT” indevidamente.
- Banco: conferir `generated_titles.model_used` grava o provedor correto (consulta posterior no histórico).

## Observações
- Não vamos alterar prompts nem estrutura de análise; só normalizar contagem e corrigir etiquetagem/nomes de modelo.
- Manter logs leves no backend para depurar `modelUsed` e provedor por título nas primeiras execuções.