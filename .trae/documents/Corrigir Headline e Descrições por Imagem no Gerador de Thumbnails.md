## Diagnóstico
- Na renderização das variações, o código usa sempre os campos globais `data.headline` e `data.seoDescription`, não valores específicos por imagem.
- Referências:
  - Headline global: `Backend/dashboard.html:14326–14332` (usa `data.headline || 'N/A'`)
  - Descrição global: `Backend/dashboard.html:14339–14343` (usa `data.seoDescription || 'N/A'`)
- Resultado: todas as imagens mostram a mesma descrição, e a headline cai para `N/A` quando o campo global falta.

## Objetivo
- Exibir headline e descrição únicas e específicas para cada imagem.
- Nunca retornar `N/A`; validar e gerar texto de fallback quando necessário.
- Impedir descrições duplicadas entre variações.

## Mudanças no Front‑end (dashboard.html)
1. Renderização por variação
- Na construção de `resultsDiv.innerHTML` (`Backend/dashboard.html:14304–14359`), substituir o uso de `data.headline`/`data.seoDescription` por valores por imagem:
  - `const headline = normalizeText(imgObj.headline ?? data.headlines?.[i] ?? generateHeadline(title, i, style, promptVariant));`
  - `const description = normalizeText(imgObj.seoDescription ?? data.descriptions?.[i] ?? generateDescription(title, i, niche, subniche, language));`
  - `const tags = Array.isArray(imgObj.tags) ? imgObj.tags : (Array.isArray(data.tagsByImage) ? data.tagsByImage[i] : data.tags);`
- Atualizar os botões de copiar para usar `headline`/`description` por imagem.

2. Validação e garantia de unicidade
- Antes de renderizar:
  - Manter `seenHeadlines` e `seenDescriptions` como `Set`.
  - Se texto já existir, aplicar `dedupeText(text, i, strategy)` que altera o ângulo (ex.: “mistério”, “engenharia”, “civilização”) com base em `prompt_variant`/`imgObj.promptUsed`.
- Nunca exibir `N/A`: quando `normalizeText(...)` retornar vazio, usar `generate*` de fallback.

3. Helpers locais
- Adicionar funções acima do bloco de renderização:
  - `normalizeText(str)` → trim, remove placeholders, valida tamanho mínimo.
  - `generateHeadline(title, i, style, pv)` → cria headline curta e impactante, variando por `i/pv` (ex.: “O ENIGMA DA PETRA”, “ENGENHARIA IMPOSSÍVEL”, etc.).
  - `generateDescription(title, i, niche, subniche, lang)` → 2–3 frases únicas com termos do nicho/subnicho.
  - `dedupeText(text, i, strategy)` → troca sinônimos/ângulo.
- Regras: sem placeholders, textos originais e relevantes.

## Mudanças no Back‑end (opcional, melhora robustez)
- Endpoint `POST /api/generate/thumbnail/complete` (`data.images`): incluir metadados por imagem:
  - `headline`, `seoDescription`, `tags`, `promptUsed`, `styleUsed` em cada `imgObj`.
- Alternativamente, retornar `headlines[]`, `descriptions[]`, `tagsByImage[]` alinhados às variações.
- Garantir no servidor que nenhum campo venha vazio; aplicar geração/dedupe quando necessário.

## Critérios de Aceite
- Cada variação exibe headline e descrição diferentes e pertinentes.
- Nenhum campo mostra `N/A` ou placeholder.
- Botões de copiar retornam o texto correto por variação.

## Validação
- Testar geração com 2–4 variações; verificar unicidade via inspeção visual.
- Simular resposta sem metadados por imagem para validar fallbacks.
- Verificar que `tags` continuam funcionais e coerentes.

## Impacto controlado
- Alterações localizadas ao bloco do gerador (`dashboard.html:14180–14393` e `14304–14359`), sem mudanças nos mapeamentos globais.
- Back‑end opcional, mas recomendado para qualidade consistente.