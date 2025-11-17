/**
 * OTIMIZADOR DE ROTEIROS
 * Analisa e otimiza roteiros gerados por IA para máxima retenção e autenticidade
 * Baseado em script_optimizer.py
 */

class ScriptOptimizer {
    constructor(niche = 'geral') {
        this.niche = niche.toLowerCase();
        
        // Padrões que indicam conteúdo gerado por IA
        this.AI_INDICATORS = [
            /\bsem saber\b.*\bprestes a descobrir\b/i,
            /\bdignidade intacta\b/i,
            /\blágrimas (escorriam|começaram a rolar)\b/i,
            /\bo destino preparava\b/i,
            /\buma reviravolta que mudaria\b/i,
            /\ba bondade (sempre|verdadeira) (vence|encontra seu caminho)\b/i,
            /\bmoral da história\b/i,
            /\bse esta história te emocionou\b/i,
            /\bdeixe seu like\b.*\bse inscreva\b/i,
            /\bcom lágrimas nos olhos\b/i,
            /\bnão fazia ideia (de que|do que)\b/i,
        ];
        
        // Clichês narrativos a evitar
        this.NARRATIVE_CLICHES = [
            'sem saber', 'prestes a', 'não fazia ideia', 'o destino',
            'a vida mudaria para sempre', 'reviravolta inesperada',
            'dignidade intacta', 'lágrimas nos olhos', 'moral da história',
            'a bondade sempre vence', 'justiça foi feita', 'karma',
            'o universo', 'destino tinha outros planos'
        ];
        
        // Frases de manipulação emocional óbvia
        this.EMOTIONAL_MANIPULATION = [
            'você vai chorar', 'prepare os lenços', 'vai te emocionar',
            'vai te fazer repensar', 'história emocionante',
            'prepare-se para se emocionar', 'não acreditou no que aconteceu'
        ];
        
        // CTAs genéricos e desesperados
        this.GENERIC_CTAS = [
            'deixe seu like', 'se inscreva no canal', 'ative o sininho',
            'compartilhe esta história', 'comente abaixo',
            'qual é a moral', 'deixe seu comentário'
        ];
        
        // Nomes comuns usados por IA (para detectar inconsistências)
        this.COMMON_AI_NAMES = [
            'Maria', 'João', 'Carlos', 'Ana', 'Pedro', 'Ricardo',
            'Sarah', 'John', 'Michael', 'David', 'Richard', 'William',
            'Sr. Wilson', 'Sr. Alberto', 'Dr. Silva', 'Sr. Santos'
        ];
    }
    
    /**
     * Analisa o roteiro completo e retorna métricas
     */
    analyzeScript(script) {
        const problems = [];
        const suggestions = [];
        const aiIndicators = [];
        const cliches = [];
        
        // 0. CRÍTICO: Detectar inconsistências de nomes (DESASTRE TOTAL)
        const nameInconsistencies = this._detectNameInconsistencies(script);
        if (nameInconsistencies.length > 0) {
            problems.push(...nameInconsistencies);
            // PENALIDADE MASSIVA: cada inconsistência de nome vale -3 pontos
            aiIndicators.push(`🚨 DESASTRE TOTAL: ${nameInconsistencies.length} inconsistências de nomes detectadas - roteiro gerado por IA sem revisão`);
        }
        
        // 1. Detectar indicadores de IA
        for (const pattern of this.AI_INDICATORS) {
            const matches = script.match(pattern);
            if (matches) {
                aiIndicators.push(`Padrão de IA detectado: ${matches[0].substring(0, 50)}...`);
            }
        }
        
        // 2. Detectar clichês
        const scriptLower = script.toLowerCase();
        for (const cliche of this.NARRATIVE_CLICHES) {
            if (scriptLower.includes(cliche)) {
                cliches.push(cliche);
            }
        }
        
        // 3. Analisar estrutura de retenção
        const retentionIssues = this._analyzeRetention(script);
        problems.push(...retentionIssues);
        
        // 4. Verificar autenticidade
        const authenticityIssues = this._analyzeAuthenticity(script);
        problems.push(...authenticityIssues);
        
        // 5. Verificar alinhamento com nicho
        const nicheIssues = this._analyzeNicheAlignment(script);
        problems.push(...nicheIssues);
        
        // Calcular scores com PENALIDADE MASSIVA para inconsistências de nomes
        const nameInconsistencyPenalty = nameInconsistencies.length * 3; // -3 pontos por inconsistência
        const retentionScore = Math.max(0, 10 - retentionIssues.length * 2 - nameInconsistencyPenalty);
        const authenticityScore = Math.max(0, 10 - aiIndicators.length * 1.5 - cliches.length * 0.5 - nameInconsistencyPenalty);
        const nicheAlignment = Math.max(0, 10 - nicheIssues.length * 2);
        
        let overallScore = (retentionScore + authenticityScore + nicheAlignment) / 3;
        
        // Se tem inconsistências de nomes, forçar score máximo de 1/10
        if (nameInconsistencies.length > 2) {
            overallScore = Math.min(overallScore, 1.0);
        }
        
        // Gerar sugestões
        const generatedSuggestions = this._generateSuggestions(
            retentionIssues, authenticityIssues, nicheIssues, aiIndicators, cliches
        );
        suggestions.push(...generatedSuggestions);
        
        // Adicionar sugestão crítica se houver inconsistências
        if (nameInconsistencies.length > 0) {
            suggestions.unshift('🚨 CRÍTICO: REESCREVA TODO O ROTEIRO mantendo APENAS UM nome para cada personagem. Este roteiro é múltiplas versões coladas sem revisão.');
        }
        
        return {
            overallScore: Math.round(overallScore * 10) / 10,
            retentionScore: Math.round(retentionScore * 10) / 10,
            authenticityScore: Math.round(authenticityScore * 10) / 10,
            nicheAlignment: Math.round(nicheAlignment * 10) / 10,
            problems,
            suggestions,
            aiIndicators,
            cliches,
            nameInconsistencies // Novo campo para destacar o problema
        };
    }
    
    /**
     * 🚨 CRÍTICO: Detecta inconsistências de nomes de personagens
     * Este é o erro mais grave em roteiros gerados por IA
     */
    _detectNameInconsistencies(script) {
        const inconsistencies = [];
        
        // Extrair todos os nomes próprios (palavras capitalizadas)
        const namePattern = /\b([A-Z][a-záàâãéêíóôõúçA-ZÁÀÂÃÉÊÍÓÔÕÚÇa-z]+(?:\s+[A-Z][a-záàâãéêíóôõúçA-ZÁÀÂÃÉÊÍÓÔÕÚÇa-z]+)?)\b/g;
        const allMatches = script.match(namePattern) || [];
        
        // Contar frequência de cada nome
        const nameFrequency = {};
        for (const name of allMatches) {
            // Ignorar palavras genéricas em maiúscula
            if (['O', 'A', 'Os', 'As', 'Um', 'Uma', 'Mas', 'Porém', 'Então', 'Enquanto', 'Quando', 'Como', 'Onde', 'Porque'].includes(name)) {
                continue;
            }
            nameFrequency[name] = (nameFrequency[name] || 0) + 1;
        }
        
        // Filtrar apenas nomes que aparecem mais de 1 vez (personagens)
        const characterNames = Object.entries(nameFrequency)
            .filter(([name, count]) => count > 1)
            .map(([name]) => name);
        
        // Detectar múltiplos nomes para o mesmo papel
        const roles = {
            protagonist: [],
            manager: [],
            elderly: [],
            company: []
        };
        
        for (const name of characterNames) {
            const lowerName = name.toLowerCase();
            
            // Detectar protagonista (nomes comuns + contexto de "protagonista")
            if (['maria', 'sarah', 'ana', 'melissa', 'joão', 'carlos', 'pedro'].some(n => lowerName.includes(n))) {
                const context = script.toLowerCase();
                if (context.includes(`${lowerName} entrou`) || context.includes(`${lowerName} chegou`) || context.includes(`${lowerName} trabalha`)) {
                    roles.protagonist.push(name);
                }
            }
            
            // Detectar gerente
            if (script.match(new RegExp(`(gerente|manager|chefe|supervisor)[^.]{0,50}${name}`, 'i')) ||
                script.match(new RegExp(`${name}[^.]{0,50}(gerente|manager|chefe|supervisor)`, 'i'))) {
                roles.manager.push(name);
            }
            
            // Detectar idoso
            if (script.match(new RegExp(`(idoso|senhor|sr\\.|elderly|velho)[^.]{0,50}${name}`, 'i')) ||
                script.match(new RegExp(`${name}[^.]{0,50}(idoso|senhor|sr\\.|elderly|velho)`, 'i'))) {
                roles.elderly.push(name);
            }
            
            // Detectar empresa/estabelecimento
            if (script.match(new RegExp(`(empresa|company|cafeteria|restaurante|loja|investments)[^.]{0,50}${name}`, 'i')) ||
                name.match(/(?:Inc|Corp|Company|Cia|Ltda|Investments)$/i)) {
                roles.company.push(name);
            }
        }
        
        // Reportar inconsistências CRÍTICAS
        if (roles.protagonist.length > 1) {
            const names = [...new Set(roles.protagonist)].join(', ');
            inconsistencies.push(`🚨 PROTAGONISTA tem MÚLTIPLOS NOMES: ${names} - espectador vai perceber em 30 segundos`);
        }
        
        if (roles.manager.length > 1) {
            const names = [...new Set(roles.manager)].join(', ');
            inconsistencies.push(`🚨 GERENTE/CHEFE tem MÚLTIPLOS NOMES: ${names} - narrativa quebrada`);
        }
        
        if (roles.elderly.length > 1) {
            const names = [...new Set(roles.elderly)].join(', ');
            inconsistencies.push(`🚨 IDOSO/CLIENTE tem MÚLTIPLOS NOMES: ${names} - caos de personagens`);
        }
        
        if (roles.company.length > 1) {
            const names = [...new Set(roles.company)].join(', ');
            inconsistencies.push(`🚨 EMPRESA/LOCAL tem MÚLTIPLOS NOMES: ${names} - contradições absurdas`);
        }
        
        // Verificar mudanças de nome no meio do texto (padrão de IA colando versões)
        const paragraphs = script.split(/\n\n+/);
        const namesByParagraph = paragraphs.map(p => {
            const matches = p.match(namePattern) || [];
            return matches.filter(name => characterNames.includes(name));
        });
        
        // Se os mesmos papéis aparecem com nomes diferentes em parágrafos consecutivos = DESASTRE
        for (let i = 0; i < namesByParagraph.length - 1; i++) {
            const currentNames = new Set(namesByParagraph[i]);
            const nextNames = new Set(namesByParagraph[i + 1]);
            
            // Comparar protagonistas comuns
            const currentProtags = namesByParagraph[i].filter(n => roles.protagonist.includes(n));
            const nextProtags = namesByParagraph[i + 1].filter(n => roles.protagonist.includes(n));
            
            if (currentProtags.length > 0 && nextProtags.length > 0 && currentProtags[0] !== nextProtags[0]) {
                inconsistencies.push(`🚨 ERRO GROTESCO: Parágrafo ${i + 1} usa "${currentProtags[0]}" mas parágrafo ${i + 2} muda para "${nextProtags[0]}" - múltiplas versões coladas sem revisão`);
            }
        }
        
        return inconsistencies;
    }
    
    /**
     * Analisa estrutura de retenção
     */
    _analyzeRetention(script) {
        const issues = [];
        
        // Verificar hook nos primeiros 30 segundos (~150 caracteres)
        const first150Chars = script.substring(0, 150).toLowerCase();
        if (!['você', 'imagine', 'já', 'por que', 'como'].some(word => first150Chars.includes(word))) {
            issues.push('Hook fraco: não engaja o espectador nos primeiros 30s');
        }
        
        // Verificar se tem pergunta no início
        if (!script.substring(0, 300).includes('?')) {
            issues.push('Falta pergunta retórica inicial para criar curiosidade');
        }
        
        // Verificar pattern interrupts (mudanças de ritmo)
        const paragraphs = script.split(/\n\n+/);
        if (paragraphs.length < 6) {
            issues.push('Poucos breaks de parágrafo - pode ficar monótono');
        }
        
        // Verificar se tem story loops (perguntas não respondidas)
        const questionCount = (script.match(/\?/g) || []).length;
        if (questionCount < 2) {
            issues.push('Poucas story loops - falta criar mais curiosidade não resolvida');
        }
        
        // Verificar ritmo de revelação
        const scriptLower = script.toLowerCase();
        if (!scriptLower.includes('mas') && !scriptLower.includes('porém')) {
            issues.push('Faltam contratempos narrativos para manter interesse');
        }
        
        return issues;
    }
    
    /**
     * Detecta marcas de conteúdo artificial
     */
    _analyzeAuthenticity(script) {
        const issues = [];
        
        // Detectar repetições excessivas
        const words = script.toLowerCase().match(/\b\w+\b/g) || [];
        const wordFreq = {};
        words.forEach(word => {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        });
        
        const commonWords = Object.entries(wordFreq)
            .filter(([word, count]) => count > 5 && word.length > 5)
            .map(([word]) => word);
        
        if (commonWords.length > 10) {
            issues.push(`Palavras repetidas demais: ${commonWords.slice(0, 5).join(', ')}`);
        }
        
        // Detectar frases muito longas (>40 palavras)
        const sentences = script.split(/[.!?]/);
        const longSentences = sentences.filter(s => s.split(/\s+/).length > 40);
        if (longSentences.length > 0) {
            issues.push(`Frases muito longas detectadas: ${longSentences.length} frases com >40 palavras`);
        }
        
        // Detectar uso excessivo de adjetivos emocionais
        const emotionalAdjectives = ['emocionante', 'inacreditável', 'surpreendente', 'devastador', 'chocante'];
        const count = emotionalAdjectives.reduce((sum, adj) => {
            return sum + (script.toLowerCase().match(new RegExp(adj, 'g')) || []).length;
        }, 0);
        
        if (count > 5) {
            issues.push('Uso excessivo de adjetivos emocionais');
        }
        
        // Detectar estrutura muito padronizada
        if ((script.match(/\.\.\./g) || []).length > 10) {
            issues.push('Uso excessivo de reticências - parece artificial');
        }
        
        return issues;
    }
    
    /**
     * Verifica alinhamento com o nicho
     */
    _analyzeNicheAlignment(script) {
        const issues = [];
        
        const nicheRequirements = {
            'história': ['quando', 'onde', 'por que', 'contexto', 'época'],
            'documentário': ['pesquisa', 'fonte', 'evidência', 'segundo', 'documentado'],
            'educação': ['aprender', 'entender', 'conceito', 'funciona', 'processo'],
            'entretenimento': ['você', 'imagine', 'já pensou', 'vamos'],
            'mistério': ['teoria', 'hipótese', 'evidência', 'possível', 'talvez']
        };
        
        if (this.niche in nicheRequirements) {
            const requiredWords = nicheRequirements[this.niche];
            const scriptLower = script.toLowerCase();
            const foundWords = requiredWords.filter(word => scriptLower.includes(word)).length;
            
            if (foundWords < requiredWords.length / 2) {
                issues.push(`Script não parece adequado para nicho '${this.niche}'`);
            }
        }
        
        return issues;
    }
    
    /**
     * Gera sugestões de melhoria
     */
    _generateSuggestions(retentionIssues, authenticityIssues, nicheIssues, aiIndicators, cliches) {
        const suggestions = [];
        
        if (aiIndicators.length > 0) {
            suggestions.push('CRÍTICO: Remover todos os padrões de IA detectados e reescrever com linguagem natural');
        }
        
        if (cliches.length > 0) {
            suggestions.push(`Substituir clichês por descrições específicas: ${cliches.slice(0, 3).join(', ')}`);
        }
        
        if (retentionIssues.length > 0) {
            suggestions.push('Reestruturar com framework: Hook > Conflito > Escalada > Clímax > Resolução');
        }
        
        if (authenticityIssues.length > 0) {
            suggestions.push('Variar estrutura de frases, usar linguagem mais coloquial');
        }
        
        suggestions.push('Adicionar detalhes específicos (números, datas, nomes reais)');
        suggestions.push('Usar mais diálogo direto e menos narração');
        suggestions.push('Incluir plot twists menores antes do twist principal');
        
        return suggestions;
    }
    
    /**
     * Otimiza o roteiro aplicando todas as correções
     */
    optimizeScript(script) {
        let optimized = script;
        
        // 0. CRÍTICO: Tentar corrigir inconsistências de nomes (se possível)
        const nameInconsistencies = this._detectNameInconsistencies(script);
        if (nameInconsistencies.length > 0) {
            console.warn('[ScriptOptimizer] 🚨 DESASTRE DETECTADO: Inconsistências de nomes encontradas. Tentando normalizar...');
            optimized = this._normalizeCharacterNames(optimized);
        }
        
        // 1. Remover CTAs genéricos
        for (const cta of this.GENERIC_CTAS) {
            optimized = optimized.replace(new RegExp(cta, 'gi'), '');
        }
        
        // 2. Substituir clichês
        const replacements = {
            'sem saber': 'não imaginava',
            'prestes a descobrir': 'logo saberia',
            'dignidade intacta': 'cabeça erguida',
            'lágrimas escorriam': 'olhos marejados',
            'o destino preparava': 'algo inesperado estava por vir',
            'a bondade sempre vence': 'o bem prevaleceu',
            'moral da história': 'o que aprendemos'
        };
        
        for (const [cliche, replacement] of Object.entries(replacements)) {
            optimized = optimized.replace(new RegExp(cliche, 'gi'), replacement);
        }
        
        // 3. Quebrar frases longas
        optimized = this._breakLongSentences(optimized);
        
        // 4. Humanizar texto (método público)
        optimized = this.humanizeText(optimized);
        
        return optimized;
    }
    
    /**
     * 🚨 CRÍTICO: Normaliza nomes de personagens (tenta salvar roteiros com múltiplas versões coladas)
     */
    _normalizeCharacterNames(script) {
        console.log('[ScriptOptimizer] Tentando normalizar nomes de personagens...');
        
        // Extrair padrão de nomes
        const namePattern = /\b([A-Z][a-záàâãéêíóôõúçA-ZÁÀÂÃÉÊÍÓÔÕÚÇa-z]+(?:\s+[A-Z][a-záàâãéêíóôõúçA-ZÁÀÂÃÉÊÍÓÔÕÚÇa-z]+)?)\b/g;
        const allMatches = script.match(namePattern) || [];
        
        // Contar frequência
        const nameFrequency = {};
        for (const name of allMatches) {
            if (!['O', 'A', 'Os', 'As', 'Um', 'Uma', 'Mas', 'Porém', 'Então', 'Enquanto', 'Quando', 'Como', 'Onde', 'Porque'].includes(name)) {
                nameFrequency[name] = (nameFrequency[name] || 0) + 1;
            }
        }
        
        // Agrupar nomes similares por papel
        const protagonistas = ['Maria', 'Sarah', 'Ana', 'Melissa', 'João', 'Carlos', 'Pedro'];
        const gerentes = ['Ricardo', 'Richard', 'John', 'Carlos Mendes'];
        const idosos = ['Sr. Wilson', 'Sr. Alberto', 'Charles Montgomery', 'Marvin Goldstein', 'William'];
        
        let normalized = script;
        
        // Detectar qual nome é mais usado para cada papel
        const usedProtagonist = Object.keys(nameFrequency).filter(name => 
            protagonistas.some(p => name.toLowerCase().includes(p.toLowerCase()))
        ).sort((a, b) => nameFrequency[b] - nameFrequency[a])[0];
        
        const usedManager = Object.keys(nameFrequency).filter(name => 
            gerentes.some(g => name.toLowerCase().includes(g.toLowerCase()))
        ).sort((a, b) => nameFrequency[b] - nameFrequency[a])[0];
        
        const usedElderly = Object.keys(nameFrequency).filter(name => 
            idosos.some(i => name.toLowerCase().includes(i.toLowerCase()))
        ).sort((a, b) => nameFrequency[b] - nameFrequency[a])[0];
        
        // Substituir todas as variações pelo nome mais usado
        if (usedProtagonist) {
            for (const variant of protagonistas) {
                if (variant !== usedProtagonist && normalized.includes(variant)) {
                    console.log(`[ScriptOptimizer] Substituindo "${variant}" → "${usedProtagonist}"`);
                    normalized = normalized.replace(new RegExp(`\\b${variant}\\b`, 'g'), usedProtagonist);
                }
            }
        }
        
        if (usedManager) {
            for (const variant of gerentes) {
                if (variant !== usedManager && normalized.includes(variant)) {
                    console.log(`[ScriptOptimizer] Substituindo "${variant}" → "${usedManager}"`);
                    normalized = normalized.replace(new RegExp(`\\b${variant}\\b`, 'g'), usedManager);
                }
            }
        }
        
        if (usedElderly) {
            for (const variant of idosos) {
                if (variant !== usedElderly && normalized.includes(variant)) {
                    console.log(`[ScriptOptimizer] Substituindo "${variant}" → "${usedElderly}"`);
                    normalized = normalized.replace(new RegExp(`\\b${variant}\\b`, 'g'), usedElderly);
                }
            }
        }
        
        console.log('[ScriptOptimizer] Normalização de nomes concluída');
        return normalized;
    }
    
    /**
     * Quebra frases muito longas
     */
    _breakLongSentences(text) {
        const sentences = text.split(/([.!?])/);
        const result = [];
        
        for (let i = 0; i < sentences.length - 1; i += 2) {
            const sentence = sentences[i];
            const punctuation = sentences[i + 1] || '';
            
            const words = sentence.split(/\s+/);
            if (words.length > 35) {
                // Quebrar na vírgula mais próxima do meio
                const mid = Math.floor(words.length / 2);
                let broken = false;
                
                for (let j = mid - 5; j <= mid + 5 && j < words.length; j++) {
                    if (words[j] && words[j].endsWith(',')) {
                        const firstPart = words.slice(0, j + 1).join(' ');
                        const secondPart = words.slice(j + 1).join(' ');
                        result.push(firstPart.slice(0, -1) + '.');
                        result.push(secondPart + punctuation);
                        broken = true;
                        break;
                    }
                }
                
                if (!broken) {
                    result.push(sentence + punctuation);
                }
            } else {
                result.push(sentence + punctuation);
            }
        }
        
        return result.join(' ');
    }
    
    /**
     * Humaniza texto removendo padrões robóticos
     */
    humanizeText(text) {
        let humanized = text;
        
        // Adicionar variações coloquiais
        humanized = humanized.replace(/\bporém\b/gi, 'mas');
        humanized = humanized.replace(/\bcontudo\b/gi, 'mas');
        
        // Remover excessos de formalidade
        humanized = humanized.replace(/\bmuitíssimo\b/gi, 'muito');
        humanized = humanized.replace(/\bextremamente\b/gi, 'muito');
        
        return humanized;
    }
    
    /**
     * Gera relatório completo da análise
     */
    generateReport(analysis) {
        let report = `
╔══════════════════════════════════════════════════════════╗
║          ANÁLISE COMPLETA DO ROTEIRO                     ║
╚══════════════════════════════════════════════════════════╝

📊 SCORES GERAIS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Overall Score:         ${analysis.overallScore}/10
  Retenção:              ${analysis.retentionScore}/10
  Autenticidade:         ${analysis.authenticityScore}/10
  Alinhamento de Nicho:  ${analysis.nicheAlignment}/10

🚨 PROBLEMAS DETECTADOS (${analysis.problems.length}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        
        analysis.problems.forEach((problem, i) => {
            report += `  ${i + 1}. ${problem}\n`;
        });
        
        if (analysis.aiIndicators.length > 0) {
            report += `\n🤖 INDICADORES DE IA (${analysis.aiIndicators.length}):\n`;
            report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
            analysis.aiIndicators.forEach(indicator => {
                report += `  ⚠️  ${indicator}\n`;
            });
        }
        
        if (analysis.cliches.length > 0) {
            report += `\n📝 CLICHÊS ENCONTRADOS (${analysis.cliches.length}):\n`;
            report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
            report += `  ${analysis.cliches.join(', ')}\n`;
        }
        
        report += `\n💡 SUGESTÕES DE MELHORIA (${analysis.suggestions.length}):\n`;
        report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        analysis.suggestions.forEach((suggestion, i) => {
            report += `  ${i + 1}. ${suggestion}\n`;
        });
        
        report += '\n' + '='.repeat(60) + '\n';
        
        return report;
    }
}

module.exports = ScriptOptimizer;

