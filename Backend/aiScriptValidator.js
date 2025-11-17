/**
 * 🤖 VALIDADOR INTELIGENTE DE ROTEIROS COM CLAUDE AI
 * Corrige automaticamente roteiros para qualidade 10/10
 */

const fetch = require('node-fetch');

class AIScriptValidator {
    constructor() {
        this.CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
        this.CLAUDE_MODEL = 'claude-sonnet-4-20250514'; // Modelo mais recente e poderoso
    }

    /**
     * 🎯 VALIDAÇÃO E CORREÇÃO AUTOMÁTICA COM CLAUDE
     * Analisa o roteiro e corrige TODOS os problemas
     */
    async validateAndFixScript(script, analysisReport, apiKey, niche = 'geral', title = '') {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🤖 VALIDADOR INTELIGENTE ATIVADO (Claude AI)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        if (!apiKey) {
            throw new Error('API Key do Claude não fornecida para validação inteligente');
        }

        // Construir prompt de correção ultra-detalhado
        const correctionPrompt = this._buildCorrectionPrompt(script, analysisReport, niche, title);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutos

            console.log('[Validador] 📤 Enviando roteiro para Claude corrigir...');
            
            const response = await fetch(this.CLAUDE_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: this.CLAUDE_MODEL,
                    system: `Você é um EDITOR PROFISSIONAL de roteiros para YouTube com 10 anos de experiência.

Sua missão é CORRIGIR roteiros ruins e transformá-los em conteúdo 10/10 que:
✅ Mantém o espectador até o final (retenção 100%)
✅ Não parece conteúdo gerado por IA
✅ Tem nomes consistentes (NUNCA muda nomes de personagens)
✅ Usa linguagem natural e envolvente
✅ Elimina TODOS os clichês e padrões de IA
✅ Tem narrativa coesa e bem estruturada

REGRAS CRÍTICAS:
1. NUNCA mude nomes de personagens no meio do roteiro
2. Escolha UM nome e use-o do início ao fim
3. Remova TODAS as frases de manipulação emocional óbvia
4. Escreva de forma natural, como um humano contando uma história
5. Mantenha o hook forte nos primeiros 15 segundos
6. Use diálogos diretos em vez de narração excessiva
7. Adicione detalhes específicos (números, datas, lugares reais)
8. ZERO clichês como "sem saber", "prestes a", "o destino"

RESPONDA APENAS COM O ROTEIRO CORRIGIDO EM TEXTO PURO.
NÃO use JSON, NÃO adicione explicações, APENAS o roteiro final.`,
                    messages: [{
                        role: 'user',
                        content: correctionPrompt
                    }],
                    temperature: 0.3, // Mais conservador para manter consistência
                    max_tokens: 8192
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('[Validador] ❌ Erro na API do Claude:', errorData);
                throw new Error(`Erro do Claude: ${errorData.error?.message || response.statusText}`);
            }

            const result = await response.json();
            
            // Extrair texto corrigido
            let correctedScript = '';
            if (result.content && Array.isArray(result.content)) {
                correctedScript = result.content
                    .map(item => item.text || '')
                    .join('\n')
                    .trim();
            }

            if (!correctedScript || correctedScript.length < 500) {
                console.error('[Validador] ❌ Resposta do Claude muito curta:', correctedScript.substring(0, 200));
                throw new Error('Claude retornou um roteiro muito curto ou vazio');
            }

            console.log(`[Validador] ✅ Claude corrigiu o roteiro! Tamanho: ${correctedScript.length} chars`);
            console.log(`[Validador] 📊 Palavras: ${correctedScript.split(/\s+/).length}`);
            
            return {
                success: true,
                correctedScript: correctedScript,
                originalLength: script.length,
                correctedLength: correctedScript.length,
                improvements: this._summarizeImprovements(script, correctedScript)
            };

        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('[Validador] ⏱️ Timeout: Claude demorou mais de 3 minutos');
                throw new Error('Validação com Claude excedeu o tempo limite de 3 minutos');
            }
            console.error('[Validador] ❌ Erro ao validar com Claude:', error.message);
            throw error;
        }
    }

    /**
     * 📝 CONSTRÓI PROMPT DE CORREÇÃO ULTRA-DETALHADO
     */
    _buildCorrectionPrompt(script, analysisReport, niche, title) {
        const problems = analysisReport.problems || [];
        const nameInconsistencies = analysisReport.nameInconsistencies || [];
        const cliches = analysisReport.cliches || [];
        const aiIndicators = analysisReport.aiIndicators || [];

        let prompt = `# 🚨 ROTEIRO QUE PRECISA SER CORRIGIDO

## INFORMAÇÕES:
- **Título:** ${title || 'Não fornecido'}
- **Nicho:** ${niche || 'geral'}
- **Score Atual:** ${analysisReport.overallScore || 0}/10
- **Qualidade:** ${analysisReport.overallScore < 3 ? 'DESASTRE TOTAL' : analysisReport.overallScore < 6 ? 'RUIM' : 'MEDIANO'}

## 🚨 PROBLEMAS CRÍTICOS DETECTADOS:

`;

        // Problemas de nomes (CRÍTICO!)
        if (nameInconsistencies.length > 0) {
            prompt += `### ❌ INCONSISTÊNCIAS DE NOMES (GRAVÍSSIMO!):\n`;
            nameInconsistencies.forEach((issue, i) => {
                prompt += `${i + 1}. ${issue}\n`;
            });
            prompt += `\n**AÇÃO OBRIGATÓRIA:** Escolha UM nome para cada personagem e use-o SEMPRE!\n\n`;
        }

        // Outros problemas
        if (problems.length > 0) {
            prompt += `### ⚠️ PROBLEMAS ESTRUTURAIS:\n`;
            problems.slice(0, 10).forEach((prob, i) => {
                prompt += `${i + 1}. ${prob}\n`;
            });
            prompt += '\n';
        }

        // Clichês
        if (cliches.length > 0) {
            prompt += `### 📝 CLICHÊS DETECTADOS (REMOVER!):\n`;
            cliches.slice(0, 8).forEach((cliche, i) => {
                prompt += `${i + 1}. "${cliche}"\n`;
            });
            prompt += '\n';
        }

        // Indicadores de IA
        if (aiIndicators.length > 0) {
            prompt += `### 🤖 PADRÕES DE IA DETECTADOS (REESCREVER!):\n`;
            aiIndicators.slice(0, 5).forEach((indicator, i) => {
                prompt += `${i + 1}. ${indicator}\n`;
            });
            prompt += '\n';
        }

        prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📋 ROTEIRO ORIGINAL (PRECISA SER CORRIGIDO):

${script}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🎯 SUA MISSÃO:

Reescreva este roteiro COMPLETAMENTE para transformá-lo em conteúdo 10/10.

### CORREÇÕES OBRIGATÓRIAS:

1. **NOMES CONSISTENTES:**
   - Escolha UM nome para cada personagem
   - Use o MESMO nome do início ao fim
   - NUNCA mude: Maria → Sarah → Ana (isso é PROIBIDO!)

2. **ELIMINAR CLICHÊS:**
   - Remova: "sem saber", "prestes a", "o destino", "lágrimas nos olhos"
   - Use linguagem natural e específica

3. **NARRATIVA COESA:**
   - Hook forte nos primeiros 15 segundos
   - Conflito claro e escalada de tensão
   - Clímax impactante
   - Resolução satisfatória

4. **LINGUAGEM NATURAL:**
   - Escreva como um humano conta histórias
   - Use diálogos diretos: "Maria disse: 'Não vou aceitar isso!'"
   - Evite narração excessiva

5. **DETALHES ESPECÍFICOS:**
   - Adicione números: "trabalhou por 5 anos", "economizou R$ 2.000"
   - Datas: "em março de 2023"
   - Lugares: "no centro de São Paulo"

6. **RETENÇÃO MÁXIMA:**
   - Pergunta intrigante no início
   - Plot twists menores ao longo do roteiro
   - Suspense mantido até o final

7. **AUTENTICIDADE:**
   - Pareça uma história real, não ficção genérica
   - Use emoções sutis, não manipulação óbvia
   - Zero frases de "deixe seu like" ou "se inscreva"

### FORMATO DA RESPOSTA:

Escreva APENAS o roteiro corrigido em texto puro.
NÃO use JSON, NÃO adicione comentários, APENAS o roteiro final.

O roteiro deve ter entre ${Math.floor(script.split(/\s+/).length * 0.9)} e ${Math.floor(script.split(/\s+/).length * 1.2)} palavras.

Agora, CORRIJA este roteiro para nível 10/10:
`;

        return prompt;
    }

    /**
     * 📊 RESUMO DAS MELHORIAS APLICADAS
     */
    _summarizeImprovements(originalScript, correctedScript) {
        const improvements = [];

        // Contagem de palavras
        const originalWords = originalScript.split(/\s+/).length;
        const correctedWords = correctedScript.split(/\s+/).length;
        improvements.push(`Palavras: ${originalWords} → ${correctedWords}`);

        // Verificar se removeu clichês comuns
        const cliches = ['sem saber', 'prestes a', 'o destino', 'lágrimas nos olhos', 'dignidade intacta'];
        const clichesRemoved = cliches.filter(c => 
            originalScript.toLowerCase().includes(c) && !correctedScript.toLowerCase().includes(c)
        );
        if (clichesRemoved.length > 0) {
            improvements.push(`Clichês removidos: ${clichesRemoved.length}`);
        }

        // Verificar se aumentou diálogos diretos
        const originalDialogues = (originalScript.match(/["']/g) || []).length;
        const correctedDialogues = (correctedScript.match(/["']/g) || []).length;
        if (correctedDialogues > originalDialogues) {
            improvements.push(`Diálogos diretos aumentados: ${originalDialogues} → ${correctedDialogues}`);
        }

        // Verificar se tem mais números/datas
        const originalNumbers = (originalScript.match(/\d+/g) || []).length;
        const correctedNumbers = (correctedScript.match(/\d+/g) || []).length;
        if (correctedNumbers > originalNumbers) {
            improvements.push(`Detalhes específicos (números) aumentados: ${originalNumbers} → ${correctedNumbers}`);
        }

        // Verificar consistência de nomes (heurística simples)
        const originalNameCount = this._countUniqueNames(originalScript);
        const correctedNameCount = this._countUniqueNames(correctedScript);
        if (correctedNameCount < originalNameCount) {
            improvements.push(`Nomes inconsistentes reduzidos: ${originalNameCount} → ${correctedNameCount}`);
        }

        return improvements;
    }

    /**
     * 🔍 CONTA NOMES ÚNICOS (APROXIMADO)
     */
    _countUniqueNames(text) {
        const commonNames = ['Maria', 'Sarah', 'Ana', 'João', 'Carlos', 'Pedro', 'Ricardo', 'Richard', 'John', 'William'];
        const foundNames = new Set();
        
        commonNames.forEach(name => {
            if (text.includes(name)) {
                foundNames.add(name);
            }
        });

        return foundNames.size;
    }
}

module.exports = AIScriptValidator;

