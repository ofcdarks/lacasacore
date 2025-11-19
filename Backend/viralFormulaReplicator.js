/**
 * 🎯 REPLICADOR DE FÓRMULA VIRAL
 * Analisa roteiros virais e replica sua estrutura/fórmula em novos roteiros
 */

class ViralFormulaReplicator {
    constructor() {
        this.CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
        this.CLAUDE_MODEL = 'claude-opus-4-20250514'; // Opus 4 para máxima qualidade
    }

    /**
     * 🔬 ANALISA A FÓRMULA VIRAL DO ROTEIRO ORIGINAL
     */
    async analyzeViralFormula(originalScript, apiKey, videoTitle = '', niche = 'geral') {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔬 ANALISANDO FÓRMULA VIRAL DO ROTEIRO ORIGINAL');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const analysisPrompt = `Você é um especialista em ANÁLISE DE CONTEÚDO VIRAL com 15 anos de experiência.

Analise o roteiro abaixo e EXTRAIA A FÓRMULA COMPLETA que o torna viral:

TÍTULO: ${videoTitle}
NICHO: ${niche}

ROTEIRO ORIGINAL:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${originalScript}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Extraia e documente com MÁXIMO DETALHAMENTO:

1. **ESTRUTURA NARRATIVA:**
   - Quantos atos tem? Como são divididos?
   - Qual o ritmo de revelação das informações?
   - Como constrói e resolve tensão?
   - Estrutura de começo-meio-fim específica

2. **HOOK (Primeiros 15 segundos):**
   - Qual é EXATAMENTE o hook usado?
   - Por que funciona psicologicamente?
   - Que emoção/curiosidade desperta?
   - Técnicas específicas (pergunta, afirmação chocante, promessa, etc)

3. **GATILHOS EMOCIONAIS:**
   - Quais emoções são ativadas e QUANDO?
   - Qual a sequência emocional do roteiro?
   - Como mantém o espectador engajado?
   - Momentos de pico emocional

4. **TÉCNICAS DE RETENÇÃO:**
   - Story loops usados
   - Pattern interrupts
   - Cliffhangers internos
   - Técnicas de curiosidade
   - Como evita que o espectador saia

5. **ESTILO DE LINGUAGEM:**
   - Tom específico (formal, casual, dramático, etc)
   - Tipo de vocabulário
   - Tamanho médio de frases
   - Uso de perguntas retóricas
   - Ritmo da narrativa

6. **PERSONAGENS/ELEMENTOS:**
   - Arquétipos usados
   - Desenvolvimento de personagem
   - Conflitos apresentados
   - Resolução narrativa

7. **DIFERENCIAIS ÚNICOS:**
   - O que este roteiro faz DE DIFERENTE?
   - Qual o "twist" ou elemento surpresa?
   - Por que É ESTE roteiro que viraliza e não outro?

8. **FÓRMULA REPLICÁVEL:**
   - Se fosse ensinar alguém a criar um roteiro similar, que PASSO A PASSO você daria?
   - Que regras DEVEM ser seguidas?
   - Que erros DEVEM ser evitados?

IMPORTANTE: Seja ULTRA-ESPECÍFICO. Não diga "usa hook forte", diga "inicia com pergunta retórica + afirmação chocante nos primeiros 8 segundos".

Responda em JSON com esta estrutura:
{
  "hook": { "technique": "...", "example": "...", "why_works": "..." },
  "structure": { "acts": 3, "timing": ["0-20%: setup", "20-80%: development", "80-100%: climax"], "details": "..." },
  "emotional_triggers": ["curiosidade inicial", "surpresa aos 30s", "tensão crescente", ...],
  "retention_techniques": ["story loop aberto aos 15s", "pattern interrupt aos 45s", ...],
  "language_style": { "tone": "...", "sentence_length": "...", "vocabulary": "..." },
  "unique_differentials": ["...", "..."],
  "replicable_formula": {
    "step1": "...",
    "step2": "...",
    ...
  },
  "dos": ["DEVE fazer X", "DEVE incluir Y", ...],
  "donts": ["NUNCA fazer X", "EVITAR Y", ...]
}`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000);

            const response = await fetch(this.CLAUDE_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: this.CLAUDE_MODEL,
                    system: "Você é um especialista em análise de conteúdo viral. Responda APENAS com o objeto JSON solicitado.",
                    messages: [{ role: 'user', content: analysisPrompt }],
                    temperature: 0.4,
                    max_tokens: 8192
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Erro do Claude: ${errorData.error?.message || response.statusText}`);
            }

            const result = await response.json();
            let jsonText = result.content.map(item => item.text || '').join('\n');
            
            // Extrair JSON
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('Claude não retornou JSON válido na análise');
            }

            const formula = JSON.parse(jsonMatch[0]);
            console.log('[ViralFormula] ✅ Fórmula viral extraída com sucesso!');
            
            return formula;

        } catch (error) {
            console.error('[ViralFormula] ❌ Erro ao analisar fórmula:', error.message);
            throw error;
        }
    }

    /**
     * 🚀 REPLICA A FÓRMULA VIRAL EM UM NOVO ROTEIRO
     */
    async replicateFormula(viralFormula, newTitle, originalScript, currentScript, apiKey, niche = 'geral', duration = 3) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🚀 REPLICANDO FÓRMULA VIRAL EM NOVO ROTEIRO');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const replicationPrompt = `Você é um ROTEIRISTA PROFISSIONAL especializado em replicar fórmulas virais.

MISSÃO: Reescrever COMPLETAMENTE o roteiro abaixo usando a FÓRMULA VIRAL extraída de um roteiro de sucesso.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 INFORMAÇÕES DO NOVO ROTEIRO:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Título: ${newTitle}
Nicho: ${niche}
Duração: ${duration} minutos
Palavras esperadas: ${Math.round(duration * 150)} palavras

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 FÓRMULA VIRAL A SER REPLICADA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${JSON.stringify(viralFormula, null, 2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 ROTEIRO ORIGINAL VIRAL (REFERÊNCIA - NÃO COPIAR):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${originalScript.substring(0, 2000)}...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 ROTEIRO ATUAL (PRECISA SER REESCRITO):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${currentScript}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ INSTRUÇÕES OBRIGATÓRIAS - NÍVEL 10/10:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **REPLIQUE A ESTRUTURA EXATA:**
   ${viralFormula.structure ? `- ${viralFormula.structure.acts} atos com timing: ${viralFormula.structure.timing ? viralFormula.structure.timing.join(', ') : 'similar ao original'}` : '- Mesma estrutura do original'}
   - Mesma sequência narrativa
   - Mesmo ritmo de revelação

2. **HOOK IDÊNTICO (técnica):**
   ${viralFormula.hook ? `- Use: ${viralFormula.hook.technique}` : '- Use técnica similar ao original'}
   ${viralFormula.hook ? `- Exemplo: "${viralFormula.hook.example}"` : ''}
   - Deve despertar a MESMA emoção nos primeiros 15 segundos

3. **GATILHOS EMOCIONAIS NA MESMA ORDEM:**
   ${viralFormula.emotional_triggers ? viralFormula.emotional_triggers.map((t, i) => `- ${i + 1}. ${t}`).join('\n   ') : '- Mesma sequência emocional do original'}

4. **TÉCNICAS DE RETENÇÃO:**
   ${viralFormula.retention_techniques ? viralFormula.retention_techniques.map(t => `- ${t}`).join('\n   ') : '- Mesmas técnicas do original'}

5. **ESTILO DE LINGUAGEM:**
   ${viralFormula.language_style ? `- Tom: ${viralFormula.language_style.tone}` : '- Mesmo tom do original'}
   ${viralFormula.language_style ? `- Frases: ${viralFormula.language_style.sentence_length}` : ''}
   - Use o MESMO estilo de escrita

6. **DIFERENCIAIS ÚNICOS:**
   ${viralFormula.unique_differentials ? viralFormula.unique_differentials.map(d => `- ${d}`).join('\n   ') : '- Inclua elementos surpresa similares'}

7. **REGRAS OBRIGATÓRIAS (DOS):**
   ${viralFormula.dos ? viralFormula.dos.map(d => `✅ ${d}`).join('\n   ') : ''}

8. **REGRAS PROIBIDAS (DON'TS):**
   ${viralFormula.donts ? viralFormula.donts.map(d => `❌ ${d}`).join('\n   ') : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 RESULTADO ESPERADO:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Roteiro 10/10 de qualidade
- Segue EXATAMENTE a fórmula viral
- Mantém o mesmo impacto emocional
- Usa as mesmas técnicas de retenção
- TEM O MESMO POTENCIAL VIRAL do original
- ${Math.round(duration * 150)} palavras

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPORTANTE:
- NÃO copie o conteúdo do roteiro original
- COPIE a FÓRMULA, ESTRUTURA e TÉCNICAS
- O tema é diferente, mas a FÓRMULA é a mesma
- Resultado deve ser 10/10 em qualidade

RESPONDA APENAS COM O ROTEIRO FINAL EM TEXTO PURO.
SEM JSON, SEM EXPLICAÇÕES, APENAS O ROTEIRO.`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000);

            const response = await fetch(this.CLAUDE_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: this.CLAUDE_MODEL,
                    system: "Você é um roteirista profissional. Responda APENAS com o texto do roteiro, sem usar JSON, objetos ou formatações especiais. Escreva texto corrido e natural.",
                    messages: [{ role: 'user', content: replicationPrompt }],
                    temperature: 0.7,
                    max_tokens: 8192
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Erro do Claude: ${errorData.error?.message || response.statusText}`);
            }

            const result = await response.json();
            const replicatedScript = result.content.map(item => item.text || '').join('\n').trim();

            if (!replicatedScript || replicatedScript.length < 500) {
                throw new Error('Claude retornou roteiro muito curto');
            }

            console.log(`[ViralFormula] ✅ Roteiro replicado! Tamanho: ${replicatedScript.length} chars`);
            console.log(`[ViralFormula] 📊 Palavras: ${replicatedScript.split(/\s+/).length}`);

            return {
                success: true,
                replicatedScript: replicatedScript,
                formula: viralFormula
            };

        } catch (error) {
            console.error('[ViralFormula] ❌ Erro ao replicar fórmula:', error.message);
            throw error;
        }
    }
}

module.exports = ViralFormulaReplicator;

