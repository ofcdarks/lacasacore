// --- IMPORTS ---
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs'); // Importando o módulo File System
require('dotenv').config(); // Carrega as variáveis do ficheiro .env

// Usar @distube/ytdl-core diretamente do GitHub (master branch) - versão mais atualizada
const ytdl = require('@distube/ytdl-core');
console.log('[Sistema] Usando @distube/ytdl-core do GitHub (master branch) - versão mais recente');
const { YoutubeTranscript } = require('youtube-transcript');
const { fetch } = require('undici');
const { ImageFX, AspectRatio, Model } = require('./imagefx.js');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const { OpenAI } = require('openai');
const fse = require('fs-extra');
const axios = require('axios');
const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const ScriptOptimizer = require('./scriptOptimizer.js');

// Configurar caminho do FFmpeg e FFprobe automaticamente
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);
console.log(`[Sistema] FFmpeg configurado: ${ffmpegInstaller.path}`);
console.log(`[Sistema] FFprobe configurado: ${ffprobeInstaller.path}`);

// --- CONFIGURAÇÃO ---
const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'seu-segredo-jwt-super-secreto-trocar-em-prod';

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'abc123def456ghi789jkl012mno345pqr'; // 32 caracteres
const ALGORITHM = 'aes-256-cbc';

// --- GLOBALS ---
let db;

// SSE clients para progresso em tempo real
const sseClients = new Map();

// Diretório temporário para arquivos de áudio
const TEMP_DIR = path.join(__dirname, 'temp_audio');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// --- MIDDLEWARES ---
app.use(cors({
  origin: '*', // Allow any origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Explicitly allow methods
  allowedHeaders: ['Content-Type', 'Authorization'] // Explicitly allow headers
}));
app.use(express.json({ limit: '50mb' }));

// Aumentar timeout para requisições longas (transcrição pode demorar)
app.use((req, res, next) => {
    // Timeout de 15 minutos para requisições de transcrição
    if (req.path.includes('/transcript')) {
        req.setTimeout(15 * 60 * 1000); // 15 minutos
        res.setTimeout(15 * 60 * 1000);
    }
    next();
}); // Aumentar limite para suportar URLs de imagens grandes
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Desabilitar cache para arquivos HTML durante desenvolvimento
app.use(express.static(__dirname, {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Middleware para garantir que todas as respostas sejam JSON válido
app.use((req, res, next) => {
    // Interceptar res.json para garantir formato válido
    const originalJson = res.json;
    res.json = function(data) {
        // Garantir que sempre retorna JSON válido
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch {
                data = { msg: data };
            }
        }
        res.setHeader('Content-Type', 'application/json');
        return originalJson.call(this, data);
    };
    next();
});

// Middleware de tratamento de erros para garantir que sempre retorne JSON
app.use((err, req, res, next) => {
    console.error('Erro no middleware:', err);
    if (!res.headersSent) {
        res.status(500).json({ msg: err.message || 'Erro interno do servidor.' });
    }
});

// Rota para redirecionar o acesso direto ao arquivo de autenticação
app.get('/la-casa-dark-core-auth.html', (req, res) => {
    res.redirect('/');
});

// Rota principal para servir a página de autenticação
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'la-casa-dark-core-auth.html'));
});


// --- FUNÇÕES AUXILIARES DE ENCRIPTAÇÃO ---
function encrypt(text) {
    if (!ENCRYPTION_SECRET || ENCRYPTION_SECRET.length !== 32) {
        console.error("ENCRYPTION_SECRET inválida. Deve ter 32 caracteres.");
        throw new Error("Configuração de encriptação inválida.");
    }
    const iv = crypto.randomBytes(16); // Gera um novo IV para cada encriptação
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_SECRET), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

function decrypt(hash) {
    if (!ENCRYPTION_SECRET || ENCRYPTION_SECRET.length !== 32) {
        console.error("ENCRYPTION_SECRET inválida. Deve ter 32 caracteres.");
        throw new Error("Configuração de encriptação inválida.");
    }
    try {
        const parts = hash.split(':');
        const decipher_iv = Buffer.from(parts.shift(), 'hex');
        const encryptedText = Buffer.from(parts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_SECRET), decipher_iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error("Falha ao desencriptar:", err);
        return null;
    }
}


// --- FUNÇÕES AUXILIARES DE MINERAÇÃO (YOUTUBE API V3) ---
async function callYouTubeDataAPI(videoId, apiKey) {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${apiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok || !data.items || data.items.length === 0) {
            throw new Error(data.error?.message || 'Vídeo não encontrado ou falha na API do YouTube.');
        }
        
        const item = data.items[0];
        const snippet = item.snippet;
        const stats = item.statistics;

        return {
            title: snippet.title,
            description: snippet.description || '',
            thumbnailUrl: snippet.thumbnails.maxres?.url || snippet.thumbnails.high?.url || snippet.thumbnails.default?.url,
            views: stats.viewCount || 0,
            likes: stats.likeCount || 0,
            comments: stats.commentCount || 0,
            days: Math.round((new Date() - new Date(snippet.publishedAt)) / (1000 * 60 * 60 * 24))
        };
    } catch (err) {
        console.error("Erro ao chamar YouTube Data API v3:", err);
        throw new Error(`Falha ao buscar dados do YouTube: ${err.message}`);
    }
}

async function getChannelVideosWithDetails(channelId, apiKey, order = 'date', maxResults = 5) {
    try {
        // Etapa 1: Buscar IDs dos vídeos
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&order=${order}&maxResults=${maxResults}&type=video&key=${apiKey}`;
        const searchResponse = await fetch(searchUrl);
        
        if (!searchResponse.ok) {
            const errorText = await searchResponse.text();
            console.error('[getChannelVideosWithDetails] Erro na busca de vídeos:', searchResponse.status, errorText.substring(0, 200));
            // Tentar parsear como JSON, se falhar retornar array vazio
            try {
                const errorData = JSON.parse(errorText);
                throw new Error(errorData.error?.message || `Erro ao buscar vídeos: ${searchResponse.status}`);
            } catch {
                throw new Error(`Erro ao buscar vídeos do canal: ${searchResponse.status}`);
            }
        }
        
        const searchData = await searchResponse.json();
        if (!searchData.items || !Array.isArray(searchData.items)) {
            console.warn('[getChannelVideosWithDetails] Nenhum vídeo encontrado ou resposta inválida');
            return [];
        }
        
        const videoIds = searchData.items.map(item => item.id?.videoId).filter(id => id).join(',');
        if (!videoIds) {
            console.warn('[getChannelVideosWithDetails] Nenhum ID de vídeo válido encontrado');
            return [];
        }

        // Etapa 2: Buscar detalhes e estatísticas de todos os vídeos de uma vez
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`;
        const detailsResponse = await fetch(detailsUrl);
        
        if (!detailsResponse.ok) {
            const errorText = await detailsResponse.text();
            console.error('[getChannelVideosWithDetails] Erro ao buscar detalhes:', detailsResponse.status, errorText.substring(0, 200));
            // Tentar parsear como JSON, se falhar retornar array vazio
            try {
                const errorData = JSON.parse(errorText);
                throw new Error(errorData.error?.message || `Erro ao buscar detalhes: ${detailsResponse.status}`);
            } catch {
                throw new Error(`Erro ao buscar detalhes dos vídeos: ${detailsResponse.status}`);
            }
        }
        
        const detailsData = await detailsResponse.json();
        if (!detailsData.items || !Array.isArray(detailsData.items)) {
            console.warn('[getChannelVideosWithDetails] Nenhum detalhe de vídeo encontrado');
            return [];
        }

        // Etapa 3: Mapear e formatar os dados (com receita e RPM estimados)
        return detailsData.items.map(item => {
            const uploadDate = new Date(item.snippet.publishedAt);
            const daysPosted = Math.round((new Date() - uploadDate) / (1000 * 60 * 60 * 24));
            const views = parseInt(item.statistics.viewCount || 0);
            // Calcular receita e RPM (usar padrão, pode ser melhorado buscando nicho do canal)
            const rpm = getRPMByNiche(null);
            const estimatedRevenueUSD = (views / 1000) * rpm.usd;
            const estimatedRevenueBRL = (views / 1000) * rpm.brl;
            
            return {
                videoId: item.id,
                title: item.snippet.title,
                thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url || '',
                publishedAt: item.snippet.publishedAt,
                views: views,
                likes: parseInt(item.statistics.likeCount || 0),
                comments: parseInt(item.statistics.commentCount || 0),
                days: daysPosted,
                estimatedRevenueUSD: estimatedRevenueUSD,
                estimatedRevenueBRL: estimatedRevenueBRL,
                rpmUSD: rpm.usd,
                rpmBRL: rpm.brl
            };
        });
    } catch (err) {
        console.error('[getChannelVideosWithDetails] Erro geral:', err.message);
        // Sempre retornar array vazio em caso de erro, não lançar exceção
        return [];
    }
}

// --- Helper para buscar imagem como Base64 ---
async function fetchImageAsBase64(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Falha ao baixar imagem: ${response.statusText}`);
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        return { base64, mimeType };
    } catch (err) {
        console.error(`Erro ao converter imagem para base64: ${err.message}`);
        throw err;
    }
}

// --- Helper para corrigir JSON com quebras de linha não escapadas ---
function fixJsonWithUnescapedNewlines(jsonString) {
    let result = '';
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < jsonString.length; i++) {
        const char = jsonString[i];
        const nextChar = jsonString[i + 1];
        
        if (escapeNext) {
            result += char;
            escapeNext = false;
            continue;
        }
        
        if (char === '\\') {
            result += char;
            escapeNext = true;
            continue;
        }
        
        if (char === '"') {
            inString = !inString;
            result += char;
            continue;
        }
        
        if (inString && (char === '\n' || char === '\r')) {
            // Substituir quebras de linha dentro de strings por \n escapado
            if (char === '\r' && nextChar === '\n') {
                result += '\\n';
                i++; // Pular o \n também
            } else {
                result += '\\n';
            }
            continue;
        }
        
        result += char;
    }
    
    return result;
}

// --- Helper para analisar resposta JSON da IA ---
function parseAIResponse(responseText, serviceName) {
    try {
        // Limpar o texto removendo possíveis markdown code blocks
        let cleanedText = responseText.trim();
        
        // Remover markdown code blocks se existirem
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
        
        // Tenta encontrar um objeto JSON dentro de uma string maior (comum com Claude)
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            let jsonString = jsonMatch[0];
            
            // Tentar parsear diretamente
            try {
                return JSON.parse(jsonString);
            } catch (parseError) {
                // Se falhar, tentar corrigir quebras de linha não escapadas
                try {
                    const fixedJson = fixJsonWithUnescapedNewlines(jsonString);
                    return JSON.parse(fixedJson);
                } catch (secondError) {
                    // Última tentativa: usar uma abordagem mais robusta
                    // Extrair apenas o conteúdo entre as primeiras chaves
                    const firstBrace = jsonString.indexOf('{');
                    const lastBrace = jsonString.lastIndexOf('}');
                    
                    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                        let extractedJson = jsonString.substring(firstBrace, lastBrace + 1);
                        extractedJson = fixJsonWithUnescapedNewlines(extractedJson);
                        return JSON.parse(extractedJson);
                    }
                    
                    throw parseError;
                }
            }
        }
        
        // Se não encontrar, tenta parsear a string inteira
        return JSON.parse(cleanedText);
    } catch (e) {
        console.error(`[Análise-${serviceName}] Falha ao parsear JSON da IA:`, e);
        console.error(`[Análise-${serviceName}] Texto recebido (primeiros 2000 caracteres):`, responseText.substring(0, 2000));
        
        // Tentar uma última abordagem: usar regex para extrair campos específicos
        try {
            // Regex mais robusta que lida com quebras de linha dentro de strings
            const nicheMatch = responseText.match(/"niche"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            const subnicheMatch = responseText.match(/"subniche"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            // Usar [\s\S] em vez de . com flag s para compatibilidade
            const motivoMatch = responseText.match(/"motivoSucesso"\s*:\s*"((?:[^"\\]|\\.|[\s\S])*?)"/);
            const formulaMatch = responseText.match(/"formulaTitulo"\s*:\s*"((?:[^"\\]|\\.|[\s\S])*?)"/);
            
            if (nicheMatch && motivoMatch) {
                console.warn(`[Análise-${serviceName}] Usando fallback de parsing regex devido a JSON malformado`);
                
                // Extrair títulos sugeridos usando regex (mais robusta)
                const titulosMatches = [...responseText.matchAll(/"titulo"\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
                const titulos = titulosMatches.map(m => m[1]).filter(t => t.length > 0);
                
                // Limpar quebras de linha dos valores extraídos
                const cleanValue = (val) => val.replace(/\r?\n/g, ' ').trim();
                
                return {
                    niche: cleanValue(nicheMatch[1]),
                    subniche: subnicheMatch ? cleanValue(subnicheMatch[1]) : 'N/A',
                    analiseOriginal: {
                        motivoSucesso: cleanValue(motivoMatch[1]),
                        formulaTitulo: formulaMatch ? cleanValue(formulaMatch[1]) : 'N/A'
                    },
                    titulosSugeridos: titulos.map((titulo, index) => ({
                        titulo: cleanValue(titulo),
                        pontuacao: 8,
                        explicacao: `Título gerado pela IA (parsing fallback)`
                    }))
                };
            }
        } catch (fallbackError) {
            console.error(`[Análise-${serviceName}] Fallback também falhou:`, fallbackError);
        }
        
        throw new Error(`A IA (${serviceName}) retornou um formato JSON inválido.`);
    }
}


// --- FUNÇÕES AUXILIARES DE API (O DISTRIBUIDOR) ---

async function callGeminiAPI(prompt, apiKey, model, imageUrl = null) {
    if (!apiKey) throw new Error("Chave de API do Utilizador (Gemini) não configurada.");
    
    const modelName = model; // Usar o nome do modelo diretamente do frontend

    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    const parts = [{ text: prompt }];
    if (imageUrl) {
        const { base64, mimeType } = await fetchImageAsBase64(imageUrl);
        parts.unshift({
            inlineData: {
                mimeType: mimeType,
                data: base64
            }
        });
    }

    const payload = {
        contents: [{ parts: parts }],
        generationConfig: { 
            responseMimeType: "application/json",
            temperature: 0.7, 
            topK: 1, 
            topP: 1, 
            maxOutputTokens: 8192 
        },
    };

    // Retry logic com backoff exponencial para erro 429 (Resource exhausted)
    const maxRetries = 3;
    const baseDelay = 2000; // 2 segundos base
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (!response.ok) {
                console.error('Erro da API Gemini:', result);
                
                // Tratar erro de autenticação
                if (response.status === 400 && result.error?.message.includes('API key not valid')) {
                    throw new Error(`A sua Chave de API do Gemini é inválida.`);
                }
                
                // Tratar erro 429 (Resource exhausted) com retry
                if (response.status === 429 || (result.error?.message && result.error.message.includes('Resource exhausted'))) {
                    if (attempt < maxRetries) {
                        const delay = baseDelay * Math.pow(2, attempt); // Backoff exponencial: 2s, 4s, 8s
                        console.warn(`[Gemini API] Limite de requisições atingido (429). Tentativa ${attempt + 1}/${maxRetries + 1}. Aguardando ${delay}ms antes de tentar novamente...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue; // Tentar novamente
                    } else {
                        // Todas as tentativas falharam
                        throw new Error(`Limite de requisições atingido para a API Gemini. Aguarde alguns minutos ou use outro modelo de IA (Claude ou OpenAI). Detalhes: ${result.error?.message || response.statusText}`);
                    }
                }
                
                // Outros erros não relacionados a rate limit
                throw new Error(`Erro da API Gemini: ${result.error?.message || response.statusText}`);
            }
            
            // Sucesso - processar resposta
            if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts[0].text) {
                return { titles: result.candidates[0].content.parts[0].text, model: model };
            } else {
                console.error('Resposta inesperada da API Gemini:', result);
                throw new Error('A resposta da IA (Gemini) foi bloqueada ou retornou vazia.');
            }
        } catch (error) {
            // Se for erro de rate limit e ainda temos tentativas, continuar o loop
            if (error.message.includes('Resource exhausted') || error.message.includes('Limite de requisições')) {
                if (attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    console.warn(`[Gemini API] Erro detectado. Tentativa ${attempt + 1}/${maxRetries + 1}. Aguardando ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
            
            // Se não for erro de rate limit ou se esgotaram as tentativas, lançar erro
            console.error('Falha ao chamar a API do Gemini:', error);
            throw error;
        }
    }
}
async function callOpenAIAPI(prompt, apiKey, model, imageUrl = null) {
    if (!apiKey) throw new Error("Chave de API do Utilizador (OpenAI) não configurada.");
    
    const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
    
    const modelName = model; // Usar o nome do modelo diretamente do frontend

    const content = [{ type: "text", text: prompt }];
    if (imageUrl) {
        content.unshift({
            type: "image_url",
            image_url: { "url": imageUrl, "detail": "high" }
        });
    }

    const payload = {
        model: modelName,
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: "You are a helpful assistant designed to output JSON." },
            { role: "user", content: content }
        ],
        temperature: 0.7,
        max_tokens: 4096,
    };

    try {
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (!response.ok) {
            console.error('Erro da API OpenAI:', result);
            if (result.error?.code === 'invalid_api_key') {
                 throw new Error(`A sua Chave de API do OpenAI é inválida.`);
            }
            throw new Error(`Erro da API OpenAI: ${result.error?.message || response.statusText}`);
        }
        if (result.choices && result.choices[0].message && result.choices[0].message.content) {
            return { titles: result.choices[0].message.content, model: model };
        } else {
            throw new Error('A resposta da IA (OpenAI) retornou vazia.');
        }
    } catch (error) {
        console.error('Falha ao chamar a API do OpenAI:', error);
        throw error;
    }
}

async function callClaudeAPI(prompt, apiKey, model, imageUrl = null) {
    if (!apiKey) throw new Error("Chave de API do Utilizador (Claude) não configurada.");
    
    const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
    
    // Mapeamento de nomes amigáveis para nomes corretos da API da Anthropic
    // MODELOS VÁLIDOS CONFIRMADOS (Novembro 2025 - Anthropic API):
    // - claude-3-7-sonnet-20250219 (Sonnet mais recente)
    // - claude-sonnet-4-20250514 (Sonnet 4)
    // - claude-opus-4-20250514 (Opus 4)
    const modelAliases = {
        'claude-3-5-sonnet-20241022': 'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-20240620': 'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-latest': 'claude-3-7-sonnet-20250219',
        'claude-3-sonnet-20240229': 'claude-3-7-sonnet-20250219',
        'claude-3.5-sonnet-20241022': 'claude-3-7-sonnet-20250219',
        'claude-3.5-sonnet-20240620': 'claude-3-7-sonnet-20250219',
        'claude-3-haiku-20240307': 'claude-3-7-sonnet-20250219',
        'claude-3.5-haiku-20241022': 'claude-3-7-sonnet-20250219',
        'claude-3-5-haiku-20241022': 'claude-3-7-sonnet-20250219',
        'claude-3-5-haiku-latest': 'claude-3-7-sonnet-20250219',
        'claude-3-opus-20240229': 'claude-opus-4-20250514'
    };
    
    const supportedModels = new Set([
        'claude-3-7-sonnet-20250219',  // Modelo mais recente
        'claude-sonnet-4-20250514',    // Sonnet 4
        'claude-opus-4-20250514'       // Opus 4
    ]);
    
    let modelName = modelAliases[model] || model;
    
    if (!supportedModels.has(modelName)) {
        if (model && model.toLowerCase().includes('opus')) {
            modelName = 'claude-opus-4-20250514';
        } else if (model && (model.toLowerCase().includes('sonnet') || model.toLowerCase().includes('4'))) {
            modelName = 'claude-sonnet-4-20250514';
        } else {
            modelName = 'claude-3-7-sonnet-20250219';
        }
        console.warn(`[Claude API] Modelo ${model} não reconhecido. Usando ${modelName} como padrão.`);
    }
    
    const validModels = ['claude-3-7-sonnet-20250219', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514'];
    
    console.log(`[Claude API] Modelo original: ${model}, Modelo mapeado: ${modelName}`);

    const content = [{ type: "text", text: prompt }];
    if (imageUrl) {
        const { base64, mimeType } = await fetchImageAsBase64(imageUrl);
        content.unshift({
            type: "image",
            source: {
                type: "base64",
                media_type: mimeType,
                data: base64
            }
        });
    }

    // Detectar se é pedido de roteiro (texto puro) ou JSON
    const isScriptRequest = typeof prompt === 'string' && (
        prompt.includes('RESPOSTA FINAL - CRÍTICO') ||
        prompt.includes('roteiro em TEXTO SIMPLES') ||
        prompt.includes('NÃO use JSON')
    );
    
    const payload = {
        model: modelName,
        system: isScriptRequest 
            ? "Você é um roteirista profissional. Responda APENAS com o texto do roteiro, sem usar JSON, objetos ou formatações especiais. Escreva texto corrido e natural."
            : "Responda APENAS com o objeto JSON solicitado, começando com { e terminando com }.",
        messages: [{ role: "user", content: content }],
        temperature: 0.7,
        max_tokens: 4096,
    };

    try {
        // Timeout de 120 segundos para evitar travamentos
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        const response = await fetch(CLAUDE_API_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const result = await response.json();
        
        // Log para debug (só primeiros 500 caracteres)
        if (isScriptRequest && result.content) {
            console.log('[Claude API] Resposta para roteiro (preview):', JSON.stringify(result).substring(0, 500));
        }

        if (!response.ok) {
            console.error('Erro da API Claude:', result);
            console.error(`[Claude API] Modelo tentado: ${modelName} (original: ${model})`);
            if (result.error?.type === 'authentication_error') {
                 throw new Error(`A sua Chave de API do Claude é inválvida.`);
            }
            // Mensagem de erro mais detalhada
            const errorMsg = result.error?.message || response.statusText;
            if (errorMsg.includes('model') || errorMsg.includes('invalid') || errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
                // Tentar fallback automático com os modelos válidos mais recentes
    const validModels = ['claude-3-7-sonnet-20250219', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514'];
                
                // Tentar outros modelos válidos se o atual falhou
                for (const altModel of validModels) {
                    if (altModel === modelName) continue; // Pular o modelo que já falhou
                    
                    try {
                        console.log(`[Claude API] Tentando modelo alternativo: ${altModel}`);
                        const fallbackPayload = { ...payload, model: altModel };
                        const fallbackResponse = await fetch(CLAUDE_API_URL, {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'x-api-key': apiKey,
                                'anthropic-version': '2023-06-01'
                            },
                            body: JSON.stringify(fallbackPayload)
                        });
                        const fallbackResult = await fallbackResponse.json();
                        
                        if (fallbackResponse.ok && fallbackResult.content && fallbackResult.content[0] && fallbackResult.content[0].text) {
                            console.log(`[Claude API] Sucesso com modelo alternativo: ${altModel}`);
                            return { titles: fallbackResult.content[0].text, model: model };
                        }
                    } catch (fallbackErr) {
                        console.warn(`[Claude API] Fallback ${altModel} falhou:`, fallbackErr.message);
                        continue;
                    }
                }
                
                // Se todos os modelos válidos falharem, mostrar erro
                throw new Error(`Modelo Claude inválido ou não disponível: ${modelName}. Use um destes modelos válidos: ${validModels.join(', ')}. Erro da API: ${errorMsg}`);
            }
            throw new Error(`Erro da API Claude: ${errorMsg}`);
        }
        if (result.content && result.content[0] && result.content[0].text) {
            return { titles: result.content[0].text, model: model };
        } else {
            throw new Error('A resposta da IA (Claude) retornou vazia.');
        }
    } catch (error) {
        // Tratamento específico para timeout
        if (error.name === 'AbortError') {
            console.error('[Claude API] ⏰ Timeout após 120 segundos');
            throw new Error('A API do Claude demorou muito para responder (timeout). Tente novamente com um roteiro mais curto ou use outro modelo.');
        }
        console.error('Falha ao chamar a API do Claude:', error);
        throw error;
    }
}

// Função para remover repetições de frases/parágrafos
function removeRepetitions(text) {
    if (!text) return text;
    
    const sentences = text.split(/[.!?]\s+/);
    const uniqueSentences = [];
    const seenSentences = new Set();
    
    for (const sentence of sentences) {
        const normalized = sentence.trim().toLowerCase().replace(/\s+/g, ' ');
        if (normalized.length > 20 && !seenSentences.has(normalized)) {
            uniqueSentences.push(sentence.trim());
            seenSentences.add(normalized);
        } else if (normalized.length <= 20) {
            uniqueSentences.push(sentence.trim());
        }
    }
    
    return uniqueSentences.join('. ') + '.';
}

function extractTextFromAIResponse(response) {
    if (response === null || response === undefined) {
        console.warn('[extractTextFromAIResponse] Response is null or undefined');
        return '';
    }
    
    // Se for string, retornar diretamente
    if (typeof response === 'string') {
        return response;
    }
    
    // Se for array, processar recursivamente
    if (Array.isArray(response)) {
        return response
            .map(item => extractTextFromAIResponse(item))
            .filter(Boolean)
            .join('\n');
    }
    
    // Se for objeto, tentar extrair de várias formas
    if (typeof response === 'object') {
        // PRIORIDADE 1: Claude retorna content como array de objetos com text
        if (response.content && Array.isArray(response.content)) {
            const extracted = response.content
                .map(item => {
                    if (typeof item === 'string') return item;
                    if (typeof item.text === 'string') return item.text;
                    if (typeof item.content === 'string') return item.content;
                    return '';
                })
                .filter(Boolean)
                .join('\n');
            
            if (extracted.trim().length > 0) {
                console.log('[extractTextFromAIResponse] ✅ Extracted from content array (Claude format)');
                return extracted;
            }
        }
        
        // PRIORIDADE 2: Campos específicos de roteiro (evitar "titles")
        const scriptFields = [
            'script',      // Roteiros
            'roteiro',     // Roteiro em PT
            'text',        // Campo genérico de texto
            'output_text', // Saída de texto
            'message',     // Mensagem
            'response',    // Resposta genérica
            'result'       // Resultado
        ];
        
        for (const field of scriptFields) {
            if (typeof response[field] === 'string' && response[field].trim().length > 0) {
                console.log(`[extractTextFromAIResponse] ✅ Extracted from field: ${field}`);
                return response[field];
            }
        }
        
        // PRIORIDADE 3: Campo "content" como string (Gemini)
        if (typeof response.content === 'string' && response.content.trim().length > 0) {
            console.log('[extractTextFromAIResponse] ✅ Extracted from content string');
            return response.content;
        }
        
        // ÚLTIMO RECURSO: "titles" (só se nada mais funcionar - geralmente ERRADO para roteiros)
        if (typeof response.titles === 'string' && response.titles.trim().length > 0) {
            console.warn('[extractTextFromAIResponse] ⚠️ Using "titles" field as fallback - this might be wrong for scripts!');
            return response.titles;
        }
        
        // Tentar JSON.stringify como último recurso
        try {
            const stringified = JSON.stringify(response);
            console.warn('[extractTextFromAIResponse] ⚠️ Had to stringify entire object:', stringified.substring(0, 200) + '...');
            return stringified;
        } catch {
            console.error('[extractTextFromAIResponse] ❌ Failed to stringify object');
            return String(response);
        }
    }
    
    console.warn('[extractTextFromAIResponse] ⚠️ Falling back to String conversion');
    return String(response);
}

function parseJSONFromString(text) {
    if (!text) return null;
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/g, '').trim();
    
    try {
        return JSON.parse(cleaned);
    } catch (err) {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (innerErr) {
                return null;
            }
        }
        return null;
    }
}

async function getPreferredAIProvider(userId, preferenceOrder = ['claude', 'openai', 'gemini']) {
    const defaultModels = {
        claude: 'claude-3-7-sonnet-20250219',  // Claude 3.7 Sonnet (Fev/2025)
        openai: 'gpt-4o',                       // GPT-4o (2025)
        gemini: 'gemini-2.5-pro'                // Gemini 2.5 Pro (2025)
    };

    for (const service of preferenceOrder) {
        try {
            const keyData = await db.get(
                'SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?',
                [userId, service]
            );
            if (keyData) {
                const decryptedKey = decrypt(keyData.api_key);
                if (decryptedKey) {
                    return {
                        service,
                        apiKey: decryptedKey,
                        model: defaultModels[service] || 'gemini-2.0-flash'
                    };
                }
            }
        } catch (err) {
            console.warn(`[AI Provider] Erro ao buscar chave ${service}:`, err.message);
        }
    }
    return null;
}

async function analyzeTranscriptForVirality({ userId, transcript, videoTitle, niche, subniche }) {
    const provider = await getPreferredAIProvider(userId, ['claude', 'openai', 'gemini']);
    if (!provider) {
        throw new Error('Configure uma chave do Claude, OpenAI ou Gemini para gerar a análise do roteiro.');
    }

    const sanitizedTranscript = transcript.trim();
    const truncatedTranscript = sanitizedTranscript.length > 20000
        ? `${sanitizedTranscript.substring(0, 20000)}\n[... conteúdo truncado para análise ...]`
        : sanitizedTranscript;

    const analysisPrompt = `
Você é um ESTRATEGISTA DE CONTEÚDO para YouTube. Analise profundamente o roteiro abaixo e explique POR QUE ele viralizou.

Retorne APENAS um JSON válido no formato:
{
  "resumo": "síntese em 2-3 frases",
  "motivosVirais": ["motivo 1", "motivo 2", "..."],
  "gatilhosEmocionais": ["gatilho 1", "..."],
  "estruturaNarrativa": [
    { "etapa": "Nome curto", "descricao": "O que acontece nessa parte", "tempoAproximado": "0:00-0:45" }
  ],
  "formulaChecklist": [
    {
      "item": "Elemento da fórmula",
      "status": "aplicado" ou "melhorar",
      "porqueFunciona": "Explicação curta",
      "comoAplicarNoMeuConteudo": "Diretriz prática",
      "upgradeSugerido": "Ajuste para ficar 10/10"
    }
  ],
  "diferencialProposto": "Diferencial para deixar ainda melhor",
  "sugestoesAplicacao": ["ação 1", "ação 2"],
  "alertas": ["possíveis riscos ou pontos de atenção"]
}

Regras:
- Idioma: português do Brasil.
- Não copie trechos do roteiro; descreva a fórmula e o raciocínio.
- Mostre como replicar a estrutura sem plagiar.
- Foque em transformar os aprendizados em um checklist acionável.

Contexto do vídeo:
- Título: ${videoTitle || 'N/A'}
- Nicho: ${niche || 'N/A'}
- Subnicho: ${subniche || 'N/A'}

ROTEIRO COMPLETO:
"""${truncatedTranscript}"""`;

    let aiResponse;
    if (provider.service === 'claude') {
        aiResponse = await callClaudeAPI(analysisPrompt, provider.apiKey, provider.model);
    } else if (provider.service === 'openai') {
        aiResponse = await callOpenAIAPI(analysisPrompt, provider.apiKey, provider.model);
    } else {
        aiResponse = await callGeminiAPI(analysisPrompt, provider.apiKey, provider.model);
    }

    const parsed = parseJSONFromString(extractTextFromAIResponse(aiResponse));
    if (!parsed) {
        throw new Error('A IA retornou um formato inválido na análise do roteiro.');
    }

    return { analysis: parsed, provider: provider.service };
}


// --- FUNÇÕES AUXILIARES DE VALIDAÇÃO DE CHAVE ---

async function validateGeminiKey(apiKey) {
    try {
        // Listar modelos para verificar se a chave é válida. É uma verificação padrão e fiável.
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (response.status === 200) {
            const data = await response.json();
            if (data.models && data.models.length > 0) {
                return { success: true };
            }
        }
        const error = await response.json();
        return { success: false, error: error.error?.message || 'Chave inválida ou sem modelos acessíveis.' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function validateOpenAIKey(apiKey) {
    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (response.status === 200) return { success: true };
        const error = await response.json();
        return { success: false, error: error.error?.message || 'Chave inválida' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function validateClaudeKey(apiKey) {
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 
                'x-api-key': apiKey, 
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: "claude-3-5-haiku-20241022", // Usar um modelo válido mais recente para validação
                max_tokens: 10,
                messages: [{ role: "user", content: "Test" }]
            })
        });
        
        const data = await response.json();

        if (response.status === 200) {
            return { success: true };
        } 
        else if (response.status === 401 || response.status === 403) {
            return { success: false, error: data.error?.type || 'Chave inválida (auth)' };
        } 
        else if (response.status === 400 && data.error?.type === 'invalid_request_error') {
            // Claude pode retornar 400 para 'invalid_request_error' mesmo com chave válida se o prompt for muito curto,
            // mas a chave em si é válida. Consideramos sucesso para validação da chave.
            return { success: true }; 
        }
        else {
            return { success: false, error: data.error?.type || `Erro ${response.status}` };
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
}



// --- MIDDLEWARE DE AUTENTICAÇÃO ---
const authenticateToken = (req, res, next) => {
    // Verificar se o banco de dados está inicializado
    if (!db) {
        return res.status(503).json({ msg: 'Servidor ainda não está pronto. Aguarde alguns instantes e tente novamente.' });
    }
    
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ msg: 'Token não fornecido.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ msg: 'Token inválido ou expirado.' });
        }
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ msg: 'Acesso negado. Requer privilégios de administrador.' });
    }
    next();
};


// --- INICIALIZAÇÃO DO BANCO DE DADOS ---
(async () => {
    try {
        // Define o caminho do banco de dados, usando a variável de ambiente ou um padrão.
        const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'lacasacorebd.db');
        
        // Garante que o diretório do banco de dados exista
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        db = await sqlite.open({
            filename: dbPath, // Usa o caminho definido
            driver: sqlite3.Database
        });

        console.log(`Conectado ao banco de dados em: ${dbPath}`);

        // --- CRIAÇÃO DAS TABELAS ---

        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                whatsapp TEXT,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                isAdmin BOOLEAN NOT NULL DEFAULT 0,
                isBlocked BOOLEAN NOT NULL DEFAULT 0,
                isApproved BOOLEAN NOT NULL DEFAULT 0,
                last_login_at DATETIME
            );
        `);
        
        await db.exec(`
            CREATE TABLE IF NOT EXISTS analysis_folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS monitored_channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                channel_name TEXT NOT NULL,
                channel_url TEXT NOT NULL,
                last_checked DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                UNIQUE(user_id, channel_url)
            );
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS analyzed_videos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                folder_id INTEGER,
                
                youtube_video_id TEXT NOT NULL,
                video_url TEXT,
                original_title TEXT,
                translated_title TEXT,
                original_views INTEGER,
                original_comments INTEGER,
                original_days INTEGER,
                original_thumbnail_url TEXT,
                
                detected_niche TEXT,
                detected_subniche TEXT,
                
                analysis_data_json TEXT, -- JSON com a 'analiseOriginal'
                
                analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (folder_id) REFERENCES analysis_folders (id) ON DELETE SET NULL
            );
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS generated_titles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_analysis_id INTEGER NOT NULL,
                title_text TEXT NOT NULL,
                model_used TEXT,
                pontuacao INTEGER DEFAULT 0,
                explicacao TEXT,
                is_checked BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (video_analysis_id) REFERENCES analyzed_videos (id) ON DELETE CASCADE
            );
        `);
        
        await db.exec(`
            CREATE TABLE IF NOT EXISTS generated_thumbnails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_analysis_id INTEGER NOT NULL,
                base_title TEXT, 
                description TEXT,
                hook_phrases_json TEXT,
                generated_image_base64 TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (video_analysis_id) REFERENCES analyzed_videos (id) ON DELETE CASCADE
            );
        `);
        
        await db.exec(`
            CREATE TABLE IF NOT EXISTS user_api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                service_name TEXT NOT NULL, 
                api_key TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                UNIQUE(user_id, service_name)
            );
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS pinned_videos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                monitored_channel_id INTEGER NOT NULL,
                youtube_video_id TEXT NOT NULL,
                title TEXT,
                thumbnail_url TEXT,
                pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                FOREIGN KEY (monitored_channel_id) REFERENCES monitored_channels (id) ON DELETE CASCADE,
                UNIQUE(user_id, monitored_channel_id, youtube_video_id)
            );
        `);

        // --- CORREÇÃO DO BANCO DE DADOS (MINI-MIGRAÇÃO) ---
        const usersInfo = await db.all("PRAGMA table_info(users)");
        if (!usersInfo.some(c => c.name === 'isApproved')) {
            console.log('MIGRATION: Adding column "isApproved" to "users"...');
            await db.exec('ALTER TABLE users ADD COLUMN isApproved BOOLEAN NOT NULL DEFAULT 0');
        }
        if (!usersInfo.some(c => c.name === 'last_login_at')) {
            console.log('MIGRATION: Adding column "last_login_at" to "users"...');
            await db.exec('ALTER TABLE users ADD COLUMN last_login_at DATETIME');
        }

        const analyzedVideosInfo = await db.all("PRAGMA table_info(analyzed_videos)");
        const analyzedVideosColumns = {
            video_url: 'TEXT',
            folder_id: 'INTEGER REFERENCES analysis_folders(id) ON DELETE SET NULL',
            translated_title: 'TEXT',
            original_views: 'INTEGER',
            original_comments: 'INTEGER',
            original_days: 'INTEGER',
            original_thumbnail_url: 'TEXT',
            analysis_data_json: 'TEXT'
        };
        for (const [col, type] of Object.entries(analyzedVideosColumns)) {
            if (!analyzedVideosInfo.some(c => c.name === col)) {
                console.log(`MIGRATION: Adding column "${col}" to "analyzed_videos"...`);
                await db.exec(`ALTER TABLE analyzed_videos ADD COLUMN ${col} ${type}`);
            }
        }

        const generatedTitlesInfo = await db.all("PRAGMA table_info(generated_titles)");
        const generatedTitlesColumns = {
            pontuacao: 'INTEGER DEFAULT 0',
            explicacao: 'TEXT',
            is_checked: 'BOOLEAN DEFAULT 0'
        };
        for (const [col, type] of Object.entries(generatedTitlesColumns)) {
            if (!generatedTitlesInfo.some(c => c.name === col)) {
                console.log(`MIGRATION: Adding column "${col}" to "generated_titles"...`);
                await db.exec(`ALTER TABLE generated_titles ADD COLUMN ${col} ${type}`);
            }
        }
        // Migração: Corrigir constraint UNIQUE em monitored_channels (permitir múltiplos canais por usuário)
        try {
            const monitoredChannelsInfo = await db.all("PRAGMA table_info(monitored_channels)");
            const tableExists = monitoredChannelsInfo.length > 0;
            
            if (tableExists) {
                // Verificar schema atual da tabela
                const tableSchema = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='monitored_channels'");
                const schemaSql = (tableSchema?.sql || '').toUpperCase();
                
                console.log('[MIGRATION] Schema atual de monitored_channels:', schemaSql.substring(0, 200));
                
                // Se a constraint UNIQUE está apenas em channel_url (sem user_id), precisamos recriar
                if (schemaSql.includes('CHANNEL_URL') && schemaSql.includes('UNIQUE') && !schemaSql.includes('UNIQUE(USER_ID, CHANNEL_URL)')) {
                    console.log('[MIGRATION] Detectada constraint UNIQUE incorreta. Recriando tabela com UNIQUE(user_id, channel_url)...');
                    try {
                        // Criar nova tabela com constraint correta
                        await db.exec(`CREATE TABLE monitored_channels_new (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER NOT NULL,
                            channel_name TEXT NOT NULL,
                            channel_url TEXT NOT NULL,
                            last_checked DATETIME,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                            UNIQUE(user_id, channel_url)
                        )`);
                        
                        // Copiar dados existentes (ignorar duplicatas se houver)
                        try {
                            await db.exec(`INSERT INTO monitored_channels_new (id, user_id, channel_name, channel_url, last_checked, created_at) 
                                         SELECT id, user_id, channel_name, channel_url, last_checked, created_at 
                                         FROM monitored_channels`);
                            console.log('[MIGRATION] Dados copiados com sucesso.');
                        } catch (copyErr) {
                            console.warn('[MIGRATION] Alguns dados podem ter duplicatas, tentando inserir apenas únicos...', copyErr.message);
                            // Tentar inserir apenas registros únicos
                            const existingChannels = await db.all('SELECT DISTINCT user_id, channel_url, MIN(id) as id, channel_name, last_checked, created_at FROM monitored_channels GROUP BY user_id, channel_url');
                            for (const channel of existingChannels) {
                                try {
                                    await db.run('INSERT INTO monitored_channels_new (id, user_id, channel_name, channel_url, last_checked, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                                        [channel.id, channel.user_id, channel.channel_name, channel.channel_url, channel.last_checked, channel.created_at]);
                                } catch (insErr) {
                                    console.warn(`[MIGRATION] Erro ao inserir canal ${channel.id}:`, insErr.message);
                                }
                            }
                        }
                        
                        // Dropar tabela antiga
                        await db.exec('DROP TABLE monitored_channels');
                        
                        // Renomear nova tabela
                        await db.exec('ALTER TABLE monitored_channels_new RENAME TO monitored_channels');
                        
                        console.log('[MIGRATION] ✅ Tabela monitored_channels recriada com sucesso com constraint UNIQUE(user_id, channel_url).');
                    } catch (recreateErr) {
                        console.error('[MIGRATION] ❌ Erro ao recriar tabela monitored_channels:', recreateErr.message);
                        // Tentar criar índice único como fallback
                        try {
                            await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_monitored_channels_user_url ON monitored_channels(user_id, channel_url)');
                            console.log('[MIGRATION] ✅ Índice único criado como fallback.');
                        } catch (idxErr) {
                            console.warn('[MIGRATION] ⚠️ Não foi possível criar índice único:', idxErr.message);
                        }
                    }
                } else {
                    // Garantir que o índice único correto existe
                    try {
                        await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_monitored_channels_user_url ON monitored_channels(user_id, channel_url)');
                        console.log('[MIGRATION] ✅ Índice único verificado/criado.');
                    } catch (idxErr) {
                        // Índice já existe ou há outro problema, continuar
                        console.log('[MIGRATION] ℹ️ Índice único já existe ou constraint já está correta.');
                    }
                }
            }
        } catch (migErr) {
            console.error('[MIGRATION] ❌ Erro na migração de monitored_channels:', migErr.message);
        }

        const pinnedVideosInfo = await db.all("PRAGMA table_info(pinned_videos)");
        if (!pinnedVideosInfo.some(c => c.name === 'monitored_channel_id')) {
            console.log('MIGRATION: Adding column "monitored_channel_id" to "pinned_videos"...');
            // This is a simplified migration. In a real app, you'd handle existing data.
            await db.exec('DROP TABLE IF EXISTS pinned_videos');
            await db.exec(`
                CREATE TABLE pinned_videos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    monitored_channel_id INTEGER NOT NULL,
                    youtube_video_id TEXT NOT NULL,
                    title TEXT,
                    thumbnail_url TEXT,
                    pinned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                    FOREIGN KEY (monitored_channel_id) REFERENCES monitored_channels (id) ON DELETE CASCADE,
                    UNIQUE(user_id, monitored_channel_id, youtube_video_id)
                );
            `);
        }

        // --- CRIAÇÃO DAS NOVAS TABELAS PARA ANALYTICS, BIBLIOTECA E INTEGRAÇÃO ---
        
        // Sistema de Analytics e Tracking
        await db.exec(`
            CREATE TABLE IF NOT EXISTS video_tracking (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                analysis_id INTEGER,
                youtube_video_id TEXT,
                title_used TEXT,
                thumbnail_used TEXT,
                predicted_ctr REAL,
                predicted_views INTEGER,
                actual_views INTEGER DEFAULT 0,
                actual_ctr REAL DEFAULT 0,
                actual_likes INTEGER DEFAULT 0,
                actual_comments INTEGER DEFAULT 0,
                revenue_estimate REAL DEFAULT 0,
                published_at DATETIME,
                tracked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (analysis_id) REFERENCES analyzed_videos(id) ON DELETE SET NULL
            );
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS analytics_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                video_tracking_id INTEGER,
                views INTEGER,
                likes INTEGER,
                comments INTEGER,
                ctr REAL,
                snapshot_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (video_tracking_id) REFERENCES video_tracking(id) ON DELETE CASCADE
            );
        `);

        // Biblioteca de Títulos Virais
        await db.exec(`
            CREATE TABLE IF NOT EXISTS viral_titles_library (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                title TEXT NOT NULL,
                niche TEXT,
                subniche TEXT,
                original_views INTEGER,
                original_ctr REAL,
                formula_type TEXT,
                keywords TEXT,
                viral_score INTEGER,
                is_favorite INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS title_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                template_name TEXT NOT NULL,
                template_pattern TEXT NOT NULL,
                niche TEXT,
                subniche TEXT,
                usage_count INTEGER DEFAULT 0,
                success_rate REAL DEFAULT 0,
                is_public INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // Biblioteca de Thumbnails Virais
        await db.exec(`
            CREATE TABLE IF NOT EXISTS viral_thumbnails_library (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                thumbnail_url TEXT,
                thumbnail_description TEXT,
                niche TEXT,
                subniche TEXT,
                original_views INTEGER,
                original_ctr REAL,
                style TEXT,
                elements TEXT,
                viral_score INTEGER,
                is_favorite INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS thumbnail_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                template_name TEXT NOT NULL,
                template_description TEXT NOT NULL,
                niche TEXT,
                subniche TEXT,
                style TEXT,
                usage_count INTEGER DEFAULT 0,
                success_rate REAL DEFAULT 0,
                is_public INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // Integração YouTube API
        await db.exec(`
            CREATE TABLE IF NOT EXISTS youtube_integrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                channel_id TEXT,
                channel_name TEXT,
                access_token TEXT,
                refresh_token TEXT,
                token_expires_at DATETIME,
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            
            -- Criar índice para melhor performance (sem UNIQUE para permitir múltiplos canais)
            CREATE INDEX IF NOT EXISTS idx_youtube_integrations_user_channel 
            ON youtube_integrations(user_id, channel_id);
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS scheduled_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                youtube_integration_id INTEGER,
                video_file_path TEXT,
                title TEXT NOT NULL,
                description TEXT,
                tags TEXT,
                thumbnail_url TEXT,
                scheduled_time DATETIME NOT NULL,
                status TEXT DEFAULT 'pending',
                published_video_id TEXT,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (youtube_integration_id) REFERENCES youtube_integrations(id) ON DELETE CASCADE
            );
        `);

        // === PARTE 2: TABELAS PARA MONITORAMENTO AUTOMÁTICO ===
        await db.exec(`
            CREATE TABLE IF NOT EXISTS viral_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                competitor_channel_id TEXT,
                competitor_channel_name TEXT,
                video_id TEXT NOT NULL,
                video_title TEXT,
                video_url TEXT,
                views INTEGER,
                views_per_day REAL,
                detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                notified INTEGER DEFAULT 0,
                notified_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS trend_analysis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                niche TEXT,
                subniche TEXT,
                video_id TEXT NOT NULL,
                video_title TEXT,
                video_url TEXT,
                channel_id TEXT,
                channel_name TEXT,
                views INTEGER,
                views_per_day REAL,
                detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                analyzed INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS competitor_monitoring (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                competitor_channel_id TEXT NOT NULL,
                competitor_channel_name TEXT,
                niche TEXT,
                subniche TEXT,
                auto_analyze INTEGER DEFAULT 1,
                last_checked DATETIME,
                check_frequency TEXT DEFAULT 'daily',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, competitor_channel_id)
            );
        `);

        await db.exec(`
            CREATE TABLE IF NOT EXISTS ai_suggestions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                suggestion_type TEXT NOT NULL,
                title TEXT,
                description TEXT,
                niche TEXT,
                subniche TEXT,
                reason TEXT,
                priority INTEGER DEFAULT 5,
                viewed INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // Tabela para agentes de roteiro
        await db.exec(`
            CREATE TABLE IF NOT EXISTS script_agents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                agent_name TEXT NOT NULL,
                niche TEXT,
                subniche TEXT,
                source_video_id TEXT,
                source_video_url TEXT,
                source_video_title TEXT,
                full_transcript TEXT,
                agent_prompt TEXT,
                agent_instructions TEXT,
                usage_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // Tabela para roteiros gerados
        await db.exec(`
            CREATE TABLE IF NOT EXISTS generated_scripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                script_agent_id INTEGER,
                title TEXT NOT NULL,
                script_content TEXT NOT NULL,
                model_used TEXT,
                niche TEXT,
                subniche TEXT,
                optimization_score REAL,
                optimization_report TEXT,
                retention_score REAL,
                authenticity_score REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (script_agent_id) REFERENCES script_agents(id) ON DELETE SET NULL
            );
        `);

        console.log('✅ Novas tabelas criadas: Analytics, Biblioteca, Integração YouTube e Agentes de Roteiro');
        
        // === MIGRAÇÃO: Remover constraint UNIQUE de youtube_integrations (permitir múltiplos canais) ===
        try {
            const tableInfo = await db.all("PRAGMA table_info(youtube_integrations)");
            const indexes = await db.all("PRAGMA index_list(youtube_integrations)");
            
            // Verificar se existe constraint UNIQUE (através de índices únicos)
            const uniqueIndexes = indexes.filter(idx => idx.unique === 1);
            if (uniqueIndexes.length > 0) {
                console.log('MIGRATION: Removendo constraint UNIQUE de youtube_integrations para permitir múltiplos canais...');
                
                // Recriar tabela sem UNIQUE
                await db.exec(`
                    CREATE TABLE IF NOT EXISTS youtube_integrations_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        channel_id TEXT,
                        channel_name TEXT,
                        access_token TEXT,
                        refresh_token TEXT,
                        token_expires_at DATETIME,
                        is_active INTEGER DEFAULT 1,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    );
                `);
                
                await db.exec(`INSERT INTO youtube_integrations_new SELECT * FROM youtube_integrations;`);
                await db.exec(`DROP TABLE youtube_integrations;`);
                await db.exec(`ALTER TABLE youtube_integrations_new RENAME TO youtube_integrations;`);
                
                // Criar índice não-único para performance
                await db.exec(`
                    CREATE INDEX IF NOT EXISTS idx_youtube_integrations_user_channel 
                    ON youtube_integrations(user_id, channel_id);
                `);
                
                console.log('✅ Migração concluída: múltiplos canais agora são permitidos');
            }
        } catch (migrationErr) {
            console.warn('Aviso na migração de youtube_integrations:', migrationErr.message);
        }

        // === MIGRAÇÃO: Adicionar campos niche e subniche em youtube_integrations ===
        try {
            const youtubeIntegrationsInfo = await db.all("PRAGMA table_info(youtube_integrations)");
            const hasNiche = youtubeIntegrationsInfo.some(c => c.name === 'niche');
            const hasSubniche = youtubeIntegrationsInfo.some(c => c.name === 'subniche');
            
            if (!hasNiche) {
                console.log('MIGRATION: Adicionando coluna "niche" em youtube_integrations...');
                await db.exec(`ALTER TABLE youtube_integrations ADD COLUMN niche TEXT`);
            }
            if (!hasSubniche) {
                console.log('MIGRATION: Adicionando coluna "subniche" em youtube_integrations...');
                await db.exec(`ALTER TABLE youtube_integrations ADD COLUMN subniche TEXT`);
            }
            if (!hasNiche || !hasSubniche) {
                console.log('✅ Migração concluída: campos niche e subniche adicionados em youtube_integrations');
            }
        } catch (migrationErr) {
            console.warn('Aviso na migração de youtube_integrations (niche/subniche):', migrationErr.message);
        }
        
        // === MIGRAÇÃO: Adicionar colunas de otimização em generated_scripts ===
        try {
            const scriptsInfo = await db.all("PRAGMA table_info(generated_scripts)");
            const hasOptimizationScore = scriptsInfo.some(c => c.name === 'optimization_score');
            const hasOptimizationReport = scriptsInfo.some(c => c.name === 'optimization_report');
            const hasRetentionScore = scriptsInfo.some(c => c.name === 'retention_score');
            const hasAuthenticityScore = scriptsInfo.some(c => c.name === 'authenticity_score');
            
            if (!hasOptimizationScore) {
                console.log('MIGRATION: Adicionando coluna "optimization_score" em generated_scripts...');
                await db.exec(`ALTER TABLE generated_scripts ADD COLUMN optimization_score REAL`);
            }
            if (!hasOptimizationReport) {
                console.log('MIGRATION: Adicionando coluna "optimization_report" em generated_scripts...');
                await db.exec(`ALTER TABLE generated_scripts ADD COLUMN optimization_report TEXT`);
            }
            if (!hasRetentionScore) {
                console.log('MIGRATION: Adicionando coluna "retention_score" em generated_scripts...');
                await db.exec(`ALTER TABLE generated_scripts ADD COLUMN retention_score REAL`);
            }
            if (!hasAuthenticityScore) {
                console.log('MIGRATION: Adicionando coluna "authenticity_score" em generated_scripts...');
                await db.exec(`ALTER TABLE generated_scripts ADD COLUMN authenticity_score REAL`);
            }
            if (!hasOptimizationScore || !hasOptimizationReport || !hasRetentionScore || !hasAuthenticityScore) {
                console.log('✅ Migração concluída: campos de otimização adicionados em generated_scripts');
            }
        } catch (migrationErr) {
            console.warn('Aviso na migração de generated_scripts (optimization):', migrationErr.message);
        }
        
        // === MIGRAÇÃO: Corrigir tabela viral_thumbnails_library ===
        try {
            const thumbnailsInfo = await db.all("PRAGMA table_info(viral_thumbnails_library)");
            const thumbnailUrlColumn = thumbnailsInfo.find(c => c.name === 'thumbnail_url');
            if (thumbnailUrlColumn && thumbnailUrlColumn.notnull === 1) {
                console.log('MIGRATION: Corrigindo constraint NOT NULL em viral_thumbnails_library.thumbnail_url...');
                // SQLite não suporta ALTER TABLE para remover NOT NULL diretamente
                // Vamos recriar a tabela sem o NOT NULL
                await db.exec(`
                    CREATE TABLE IF NOT EXISTS viral_thumbnails_library_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER,
                        thumbnail_url TEXT,
                        thumbnail_description TEXT,
                        niche TEXT,
                        subniche TEXT,
                        original_views INTEGER,
                        original_ctr REAL,
                        style TEXT,
                        elements TEXT,
                        viral_score INTEGER,
                        is_favorite INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    );
                `);
                await db.exec(`INSERT INTO viral_thumbnails_library_new SELECT * FROM viral_thumbnails_library;`);
                await db.exec(`DROP TABLE viral_thumbnails_library;`);
                await db.exec(`ALTER TABLE viral_thumbnails_library_new RENAME TO viral_thumbnails_library;`);
                console.log('✅ Migração concluída: thumbnail_url agora é opcional');
            }
        } catch (migrationErr) {
            console.warn('Aviso na migração de viral_thumbnails_library:', migrationErr.message);
        }

        // === TABELA DE CANAIS DO USUÁRIO ===
        await db.exec(`
            CREATE TABLE IF NOT EXISTS user_channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                channel_name TEXT NOT NULL,
                channel_url TEXT,
                channel_id TEXT,
                niche TEXT,
                language TEXT DEFAULT 'pt-BR',
                country TEXT DEFAULT 'BR',
                is_active INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, channel_name)
            );
        `);

        // Adicionar coluna channel_id na tabela video_tracking se não existir
        try {
            const trackingInfo = await db.all("PRAGMA table_info(video_tracking)");
            if (!trackingInfo.some(c => c.name === 'channel_id')) {
                console.log('MIGRATION: Adicionando coluna channel_id em video_tracking...');
                await db.exec('ALTER TABLE video_tracking ADD COLUMN channel_id INTEGER REFERENCES user_channels(id) ON DELETE SET NULL');
            }
        } catch (migrationErr) {
            console.warn('Aviso na migração de video_tracking:', migrationErr.message);
        }
        // Adicionar coluna full_transcript na tabela analyzed_videos se não existir
        try {
            const analyzedVideosInfo = await db.all("PRAGMA table_info(analyzed_videos)");
            if (!analyzedVideosInfo.some(c => c.name === 'full_transcript')) {
                console.log('MIGRATION: Adicionando coluna full_transcript em analyzed_videos...');
                await db.exec('ALTER TABLE analyzed_videos ADD COLUMN full_transcript TEXT');
            }
        } catch (migrationErr) {
            console.warn('Aviso na migração de analyzed_videos (full_transcript):', migrationErr.message);
        }
        
        console.log('Tabelas e colunas sincronizadas.');

        // --- CRIAÇÃO DO ADMIN ---
        const adminEmail = 'rudysilvaads@gmail.com';
        const adminPassword = '253031';
        
        const adminExists = await db.get('SELECT * FROM users WHERE email = ?', [adminEmail]);
        
        if (!adminExists) {
            console.log('Criando utilizador administrador...');
            const salt = await bcrypt.genSalt(10);
            const admin_pass_hash = await bcrypt.hash(adminPassword, salt);
            
            await db.run(
                'INSERT INTO users (name, email, whatsapp, password_hash, isAdmin, isApproved) VALUES (?, ?, ?, ?, ?, ?)',
                ['Admin Core', adminEmail, '(00) 00000-0000', admin_pass_hash, 1, 1]
            );
            console.log('Utilizador administrador criado com sucesso!');
        } else {
            await db.run('UPDATE users SET isAdmin = 1, isBlocked = 0, isApproved = 1 WHERE email = ?', [adminEmail]);
            console.log('Utilizador administrador já existe. Status verificado.');
        }

        console.log('✅ Banco de dados inicializado com sucesso!');
        
        // Sinalizar que o banco está pronto
        global.dbReady = true;

    } catch (err) {
        console.error('Erro ao conectar ou inicializar o banco de dados:', err);
        global.dbReady = false;
    }
})();


// --- ROTAS DE API ---
// NOTA: Todas as rotas devem ser definidas ANTES do app.listen() para funcionarem corretamente

// === ROTAS DE AUTENTICAÇÃO ===

app.post('/api/auth/register', async (req, res) => {
    const { name, email, whatsapp, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ msg: 'Por favor, preencha todos os campos obrigatórios.' });
    }

    try {
        const userExists = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (userExists) {
            return res.status(400).json({ msg: 'Este e-mail já está registado.' });
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const result = await db.run(
            'INSERT INTO users (name, email, whatsapp, password_hash) VALUES (?, ?, ?, ?)',
            [name, email, whatsapp, password_hash]
        );

        res.status(201).json({ msg: 'Utilizador registado com sucesso! A aguardar aprovação.', userId: result.lastID });

    } catch (err) {
        console.error('Erro no registo:', err);
        res.status(500).json({ msg: 'Erro no servidor ao tentar registar.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    // Verificar se o banco de dados está inicializado
    if (!db) {
        return res.status(503).json({ msg: 'Servidor ainda não está pronto. Aguarde alguns instantes e tente novamente.' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ msg: 'Por favor, forneça e-mail e senha.' });
    }

    try {
        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(400).json({ msg: 'Credenciais inválidas.' });
        }

        if (user.isBlocked) {
            return res.status(403).json({ msg: 'Esta conta está bloqueada. Entre em contacto com o suporte.' });
        }

        if (!user.isApproved && !user.isAdmin) {
            return res.status(403).json({ msg: 'A sua conta está pendente de aprovação.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Credenciais inválidas.' });
        }

        await db.run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

        const token = jwt.sign(
            { id: user.id, email: user.email, isAdmin: user.isAdmin },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            msg: 'Login feito com sucesso!',
            token,
            isAdmin: user.isAdmin
        });

    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ msg: 'Erro no servidor durante o login.' });
    }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const user = await db.get('SELECT id, name, email, whatsapp, isAdmin, isBlocked FROM users WHERE id = ?', [req.user.id]);
        
        if (!user) {
            return res.status(404).json({ msg: 'Utilizador não encontrado.' });
        }
        
        if (user.isBlocked) {
             return res.status(403).json({ msg: 'A sua conta foi bloqueada.' });
        }
        
        res.json(user);

    } catch (err) {
        console.error('Erro ao buscar dados do utilizador (/me):', err);
        res.status(500).json({ msg: 'Erro no servidor.' });
    }
});


// === ROTAS DE GESTÃO DE API KEYS ===

app.post('/api/keys/save', authenticateToken, async (req, res) => {
    const { service_name, api_key } = req.body;
    const userId = req.user.id;

    if (!service_name || !api_key) {
        return res.status(400).json({ msg: 'Serviço e Chave de API são obrigatórios.' });
    }

    try {
        const encryptedKey = encrypt(api_key);
        
        await db.run(
            `INSERT INTO user_api_keys (user_id, service_name, api_key) 
             VALUES (?, ?, ?)
             ON CONFLICT(user_id, service_name) 
             DO UPDATE SET api_key = excluded.api_key, created_at = CURRENT_TIMESTAMP`,
            [userId, service_name, encryptedKey]
        );

        res.status(200).json({ msg: `Chave de API para ${service_name} salva com sucesso!` });
    
    } catch (err) {
        console.error('Erro ao salvar chave de API:', err);
        res.status(500).json({ msg: 'Erro no servidor ao salvar a chave.' });
    }
});

app.get('/api/keys/status', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const keys = await db.all('SELECT service_name FROM user_api_keys WHERE user_id = ?', [userId]);
        const status = {
            gemini: keys.some(k => k.service_name === 'gemini'),
            openai: keys.some(k => k.service_name === 'openai'),
            claude: keys.some(k => k.service_name === 'claude'),
            imagefx: keys.some(k => k.service_name === 'imagefx'),
        };
        res.status(200).json(status);
    } catch (err) {
        console.error('Erro ao buscar status das chaves:', err);
        res.status(500).json({ msg: 'Erro no servidor.' });
    }
});

app.post('/api/keys/validate-all', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const keysData = await db.all('SELECT service_name, api_key FROM user_api_keys WHERE user_id = ?', [userId]);
        
        if (keysData.length === 0) {
            return res.status(400).json({ msg: 'Nenhuma chave de API foi salva ainda.' });
        }

        const allowedServices = new Set(['gemini', 'openai', 'claude', 'imagefx']);
        const filteredKeysData = keysData.filter(key => allowedServices.has(key.service_name));
        const ignoredServices = keysData.filter(key => !allowedServices.has(key.service_name));

        if (ignoredServices.length > 0) {
            console.warn(`[Validação de Chaves] Ignorando serviços não suportados: ${ignoredServices.map(s => s.service_name).join(', ')}`);
        }

        if (filteredKeysData.length === 0) {
            return res.status(400).json({ msg: 'Nenhuma chave dos serviços suportados (Gemini, Claude, OpenAI ou ImageFX) foi encontrada para validação.' });
        }

        const validationPromises = filteredKeysData.map(async (keyData) => {
            const decryptedKey = decrypt(keyData.api_key);
            if (!decryptedKey) {
                return { service: keyData.service_name, success: false, error: 'Falha ao desencriptar' };
            }

            switch (keyData.service_name) {
                case 'gemini':
                    const geminiResult = await validateGeminiKey(decryptedKey);
                    return { service: 'gemini', ...geminiResult };
                case 'openai':
                    const openaiResult = await validateOpenAIKey(decryptedKey);
                    return { service: 'openai', ...openaiResult };
                case 'claude':
                    const claudeResult = await validateClaudeKey(decryptedKey);
                    return { service: 'claude', ...claudeResult };
                case 'imagefx':
                    return { service: 'imagefx', success: true };
                default:
                    return { service: keyData.service_name, success: false, error: 'Serviço desconhecido' };
            }
        });

        const results = await Promise.all(validationPromises);
        
        res.status(200).json({ 
            msg: 'Validação concluída.',
            results: results 
        });

    } catch (err) {
        console.error('Erro ao validar chaves:', err);
        res.status(500).json({ msg: 'Erro no servidor durante a validação.' });
    }
});


// === FUNÇÕES AUXILIARES DE ANÁLISE ===

// Função para determinar se um vídeo é realmente viral
function isViralVideo(views, days, viewsPerDay) {
    // Critérios para considerar um vídeo como viral:
    // 1. Mínimo de 100.000 views totais
    // 2. Mínimo de 10.000 views/dia (para vídeos recentes)
    // 3. Ou mínimo de 50.000 views/dia nos primeiros 7 dias
    // 4. Para vídeos mais antigos (>30 dias), mínimo de 500.000 views totais
    
    if (days <= 0) {
        // Sem informação de dias, usar apenas views totais
        return views >= 500000; // 500k+ views sem info de tempo = provavelmente viral
    }
    
    if (days <= 7) {
        // Vídeo muito recente: precisa de crescimento explosivo
        return viewsPerDay >= 50000 || views >= 500000;
    } else if (days <= 30) {
        // Vídeo recente: precisa de bom crescimento
        return viewsPerDay >= 10000 || views >= 300000;
    } else {
        // Vídeo mais antigo: precisa de views totais altas
        return views >= 1000000; // 1M+ views para vídeos antigos
    }
}

// === ROTAS DE ANÁLISE (O CORAÇÃO DO SAAS) ===

app.post('/api/analyze/titles', authenticateToken, async (req, res) => {
    const { videoUrl, model, folderId } = req.body;
    const userId = req.user.id;

    if (!videoUrl || !model) {
        return res.status(400).json({ msg: 'URL do vídeo e modelo de IA são obrigatórios.' });
    }
    
    try {
        // Verificar se o banco de dados está disponível
        if (!db) {
            return res.status(503).json({ msg: 'Banco de dados não está disponível. Aguarde alguns instantes.' });
        }
        
        // --- ETAPA 1: Mineração de Dados (YouTube) ---
        console.log(`[Análise] A iniciar mineração para: ${videoUrl}`);
        let videoId;
        try {
            videoId = ytdl.getVideoID(videoUrl);
        } catch (err) {
            return res.status(400).json({ msg: 'URL do YouTube inválida.' });
        }

        // Usaremos a chave Gemini para a API do YouTube, pois é um requisito
        const geminiKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, 'gemini']);
        if (!geminiKeyData) {
            return res.status(400).json({ msg: 'Nenhuma Chave de API do Gemini configurada. É necessária para a mineração de dados do YouTube.' });
        }
        const geminiApiKey = decrypt(geminiKeyData.api_key);
        if (!geminiApiKey) {
             return res.status(500).json({ msg: 'Falha ao desencriptar a sua chave de API Gemini.' });
        }

        const videoDetails = await callYouTubeDataAPI(videoId, geminiApiKey);
        
        let transcriptText;
        let fullTranscript = null;
        try {
            const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);
            fullTranscript = transcriptData.map(t => t.text).join(' ');
            transcriptText = fullTranscript.substring(0, 500); // Apenas início para o prompt
        } catch (err) {
            console.warn(`[Análise] Não foi possível obter transcrição para ${videoId}. A continuar sem ela.`);
            transcriptText = "(Transcrição não disponível)";
            fullTranscript = null;
        }
        
        console.log(`[Análise] Vídeo encontrado: ${videoDetails.title}`);

        // --- ETAPA 1.5: Traduzir título original para português ---
        let translatedTitle = videoDetails.title;
        try {
            const translatePrompt = `Traduza o seguinte título de vídeo do YouTube para português brasileiro (PT-BR). Mantenha o sentido, impacto e estrutura original. Retorne APENAS a tradução, sem explicações ou formatação.
Título original: "${videoDetails.title}"

Tradução em PT-BR:`;
            
            // Usar o primeiro serviço disponível para tradução (preferir Gemini)
            let translateService = 'gemini';
            let translateKey = geminiApiKey;
            
            const translateResponse = await callGeminiAPI(translatePrompt, translateKey, 'gemini-2.0-flash');
            const translateText = translateResponse.titles.trim();
            
            // Limpar a resposta (remover markdown, aspas, etc)
            translatedTitle = translateText.replace(/^["']|["']$/g, '').replace(/```json|```/g, '').trim();
            if (translatedTitle.length > 200) {
                translatedTitle = translatedTitle.substring(0, 200);
            }
            console.log(`[Análise] Título traduzido: ${translatedTitle}`);
        } catch (err) {
            console.warn(`[Análise] Falha ao traduzir título, usando original: ${err.message}`);
            translatedTitle = videoDetails.title;
        }

        // --- ETAPA 2: IA - Análise de Título e Geração (PROMPT REFINADO) ---
        const viewsPerDay = Math.round(videoDetails.views / Math.max(videoDetails.days, 1));
        const isViral = isViralVideo(videoDetails.views, videoDetails.days, viewsPerDay);
        
        // Contexto de performance baseado na classificação real
        let performanceContext;
        let viralContext;
        
        if (isViral) {
            if (videoDetails.days > 0) {
                performanceContext = `Este vídeo VIRALIZOU com ${videoDetails.views.toLocaleString()} views em ${videoDetails.days} dias (média de ${viewsPerDay.toLocaleString()} views/dia) - um desempenho EXCEPCIONAL que indica alta viralização.`;
            } else {
                performanceContext = `Este vídeo VIRALIZOU com ${videoDetails.views.toLocaleString()} views - um desempenho EXCEPCIONAL que indica alta viralização.`;
            }
            viralContext = 'que VIRALIZOU';
        } else {
            // Vídeo não viral - ser honesto sobre a performance
            if (videoDetails.days > 0) {
                const performanceLevel = viewsPerDay < 100 
                    ? 'baixo desempenho' 
                    : viewsPerDay < 1000 
                        ? 'desempenho moderado' 
                        : 'bom desempenho';
                performanceContext = `Este vídeo tem ${videoDetails.views.toLocaleString()} views em ${videoDetails.days} dias (média de ${viewsPerDay.toLocaleString()} views/dia) - ${performanceLevel}. Este vídeo NÃO viralizou, mas pode ser analisado para identificar elementos que podem ser melhorados para criar versões com maior potencial viral.`;
            } else {
                performanceContext = `Este vídeo tem ${videoDetails.views.toLocaleString()} views. Este vídeo NÃO viralizou, mas pode ser analisado para identificar elementos que podem ser melhorados para criar versões com maior potencial viral.`;
            }
            viralContext = 'de referência';
        }

        const titlePrompt = `
            Você é um ESPECIALISTA EM VIRALIZAÇÃO NO YOUTUBE com experiência comprovada em criar títulos que geram MILHÕES DE VIEWS e ALTO CTR (taxa de cliques acima de 25%). Sua missão é analisar um vídeo ${isViral ? 'que VIRALIZOU' : 'de referência'} e criar variações MUITO CHAMATIVAS focadas em VIRALIZAÇÃO para canais subnichados.

            🚀 CONTEXTO DO VÍDEO ${isViral ? 'VIRAL' : 'DE REFERÊNCIA'}:
            ${performanceContext}
            
            DADOS DO VÍDEO ORIGINAL:
            - Título Original (traduzido para PT-BR): "${translatedTitle}"
            - Título Original (idioma original): "${videoDetails.title}"
            - Visualizações: ${videoDetails.views.toLocaleString()} views
            - Comentários: ${videoDetails.comments.toLocaleString()} comentários
            - Dias desde publicação: ${videoDetails.days} dias
            - Thumbnail URL: ${videoDetails.thumbnailUrl}
            - Descrição (início): ${videoDetails.description ? videoDetails.description.substring(0, 300) : 'N/A'}...
            - Transcrição (início): ${transcriptText.substring(0, 500)}...

            🎯 PROMPT DE ANÁLISE DE TÍTULOS ${isViral ? 'VIRAIS' : 'DE REFERÊNCIA'} (DIRETO DO VÍDEO):
            Este vídeo do canal ${isViral ? 'viralizou, pegou' : 'tem'} ${videoDetails.views.toLocaleString()} VIEWS${videoDetails.days > 0 ? ` EM ${videoDetails.days} DIAS` : ''} com o título: "${videoDetails.title}"
            
            OBJETIVO: Criar títulos e canais MILIONÁRIOS com MILHÕES DE VIEWS e ALTO CTR (acima de 25%).
            
            Preciso que você me dê variações MUITO CHAMATIVAS focadas em VIRALIZAÇÃO para meu canal subnichado. Cada título deve ter POTENCIAL PARA GERAR MILHÕES DE VIEWS, não apenas alguns milhares. Foque em criar títulos que se tornem virais e gerem engajamento massivo.

            🎯 SUA TAREFA (FOCO EM VIRALIZAÇÃO E MILHÕES DE VIEWS):
            1.  **Análise Profunda de Nicho e Subnicho:** 
                - Identifique o "nicho" exato e o "subniche" específico do vídeo.
                - Analise por que esse subnicho funcionou tão bem e qual o público-alvo que gerou essa viralização.
                - Identifique oportunidades de subnichos pouco explorados com alto potencial de viralização.

            2.  **Análise do Título ${isViral ? 'Viral' : 'de Referência'} (Por que ${isViral ? 'funcionou' : 'não funcionou tão bem'}?):** 
                Analise PROFUNDAMENTE o título ${isViral ? 'que viralizou' : 'de referência'} e identifique:
                - Explique o "motivoSucesso" detalhado: ${isViral ? `Por que esse título específico gerou ${videoDetails.views.toLocaleString()} views em ${videoDetails.days} dias? O que tornou ele tão viral?` : `Por que esse título gerou apenas ${videoDetails.views.toLocaleString()} views em ${videoDetails.days} dias? O que faltou para ele viralizar? Quais elementos podem ser melhorados?`}
                - Identifique a "formulaTitulo" (a estrutura exata, gatilhos mentais, palavras-chave ${isViral ? 'virais' : 'que podem ser otimizadas'}, padrões emocionais ${isViral ? 'que fizeram esse título viralizar e gerar milhões de views' : 'que podem ser melhorados para criar versões com maior potencial viral'}).
                - Analise a PSICOLOGIA POR TRÁS DO SUCESSO: Qual emoção ele despertou? Que curiosidade ele criou? Que gatilho mental ele acionou? Que palavra-chave teve maior impacto? Por que as pessoas CLICARAM nele?
                - Identifique os PADRÕES VIRAIS COMPROVADOS: números impactantes, perguntas intrigantes, segredos revelados, contrastes, FOMO, prova social, urgência, escassez.
                - Analise a ESTRUTURA DO TÍTULO: Quantas palavras? Qual é a ordem das palavras-chave? Onde estão os gatilhos mentais? Qual é o ritmo de leitura?
                - Identifique PALAVRAS-CHAVE PODEROSAS que geraram cliques: quais palavras específicas fizeram a diferença? Quais palavras emocionais criaram conexão?

            3.  **Geração de Títulos Virais (FOCO EM MILHÕES DE VIEWS E ALTO CTR):** 
                Usando a "formulaTitulo" identificada como base, crie 5 variações MUITO CHAMATIVAS de títulos EM PORTUGUÊS BRASILEIRO (PT-BR) que:
                - TENHAM ALTO POTENCIAL VIRAL (capazes de gerar MILHÕES DE VIEWS como o original, não apenas milhares)
                - USEM GATILHOS MENTAIS PODEROSOS E COMPROVADOS (curiosidade, FOMO, surpresa, urgência, escassez, autoridade, prova social, emoção intensa)
                - INCLUAM PALAVRAS-CHAVE VIRAIS E PODEROSAS (números impactantes, palavras emocionais, perguntas que prendem atenção, palavras que geram cliques)
                - SEJAM OTIMIZADOS PARA ALTO CTR (taxa de cliques acima de 25%, preferencialmente 30% ou mais)
                - MANTENHAM A ESSÊNCIA E PODER VIRAL DO TÍTULO ORIGINAL mas com MELHORIAS para maior viralização e mais views
                - SEJAM ADAPTADOS PARA O SUBNICHO identificado, mas mantendo o PODER VIRAL e a capacidade de gerar milhões de views
                - SIGAM A MESMA ESTRUTURA que funcionou no título original (ordem das palavras, ritmo, gatilhos mentais)
                - TENHAM POTENCIAL PARA VIRALIZAR e gerar engajamento massivo (compartilhamentos, comentários, views orgânicas)

                Para cada novo título, forneça:
                - "titulo": O novo título EM PORTUGUÊS BRASILEIRO (PT-BR), otimizado para viralização e milhões de views, seguindo a fórmula que funcionou no título original.
                - "pontuacao": Uma nota de 0 a 10, avaliando o potencial viral e de CTR (10 = capaz de gerar milhões de views como o original com CTR acima de 25%, 9-10 = alto potencial viral com milhões de views, 7-8 = bom potencial mas pode melhorar, abaixo de 7 = precisa ser reescrito).
                - "explicacao": Uma justificativa detalhada em PORTUGUÊS BRASILEIRO explicando: 
                  * Por que esse título tem potencial para gerar MILHÕES DE VIEWS? 
                  * Quais gatilhos mentais específicos ele usa e por que eles funcionam?
                  * Por que ele pode gerar alto CTR (acima de 25%)?
                  * Como ele se compara ao título original que viralizou?
                  * Quais elementos da "formulaTitulo" ele aplica?
                  * Por que as pessoas vão CLICAR nele?
                  * Qual é o potencial de viralização (compartilhamentos, engajamento)?

            📊 ESTRATÉGIAS DE VIRALIZAÇÃO PARA TÍTULOS (APLIQUE ESSAS TÉCNICAS):
            - **Números e Estatísticas Impactantes:** Use números específicos, grandes, ou surpreendentes (ex: "5000 anos", "1 milhão de views", "3 segundos", "10 segredos", "5 coisas que ninguém sabe").
            - **Gatilhos de Curiosidade:** Crie perguntas, mistérios, segredos revelados, coisas escondidas ou proibidas (ex: "O que ninguém te conta sobre...", "O segredo que...", "O que aconteceu com...").
            - **FOMO (Medo de Perder):** Urgência, exclusividade, oportunidade única, tempo limitado (ex: "Antes que seja tarde", "O que você está perdendo", "A última chance de...").
            - **Prova Social:** "Todo mundo está falando", "viralizou", "ninguém sabe", "revelado", "descoberto", "exclusivo" (ex: "O que todo mundo quer saber", "A verdade que ninguém conhece").
            - **Emoções Intensas:** Choque, surpresa, medo, alegria, raiva, curiosidade (ex: "Chocante", "Inacreditável", "Você não vai acreditar", "Preparado para isso?").
            - **Contraste e Oposição:** "Parecia X mas era Y", "Todo mundo pensa X mas a verdade é Y" (ex: "Você pensava que era X, mas na verdade é Y", "O que todos acreditam está errado").
            - **Palavras Poderosas:** "SECRETO", "REVELADO", "ESCONDIDO", "PROIBIDO", "NUNCA VISTO", "CHOCANTE", "INCRÍVEL", "IMPERDÍVEL", "EXCLUSIVO", "DESCOBERTO", "REAL", "VERDADEIRO".
            - **Personalização:** "Você não sabia", "Isso vai mudar sua vida", "O que ninguém te conta", "O que você precisa saber" (ex: "O que você não sabia sobre...", "Isso vai mudar como você vê...").

            ⚠️ REGRAS CRÍTICAS PARA TÍTULOS VIRAIS (CRIAR CANAIS MILIONÁRIOS):
            - TODOS os títulos sugeridos DEVEM estar em PORTUGUÊS BRASILEIRO (PT-BR).
            - A "explicacao" de cada título também deve estar em PORTUGUÊS BRASILEIRO.
            - Mantenha o IMPACTO, CURIOSIDADE e GATILHOS MENTAIS do título original, mas MELHORE-OS para maior viralização e mais views.
            - Foque APENAS em títulos que TENHAM POTENCIAL PARA GERAR MILHÕES DE VIEWS, não apenas alguns milhares. Rejeite títulos que não tenham potencial viral alto.
            - Cada título deve ter um POTENCIAL VIRAL MUITO ALTO (pontuação 9-10, preferencialmente 10). Títulos com pontuação abaixo de 9 devem ser reescritos.
            - Os títulos devem ser OTIMIZADOS PARA ALTO CTR (acima de 25%, preferencialmente 30% ou mais).
            - Adapte para o SUBNICHO identificado, mas SEMPRE mantenha o PODER VIRAL do título original e a capacidade de gerar milhões de views.
            - Use a mesma "formulaTitulo" que funcionou no título viral, mas com variações criativas e melhorias que aumentem o potencial de viralização.
            - Cada título deve seguir a ESTRUTURA COMPROVADA do título original (ordem das palavras, ritmo, posicionamento dos gatilhos mentais).
            - Foque em criar títulos que VIRALIZEM e gerem engajamento massivo (compartilhamentos, comentários, views orgânicas).
            - Priorize títulos que TENHAM POTENCIAL PARA CRIAR CANAIS MILIONÁRIOS com milhões de views e alto CTR.

            IMPORTANTE: A sua resposta completa deve ser APENAS o objeto JSON, sem nenhum texto, comentário ou formatação markdown à volta.
            {
              "niche": "...",
              "subniche": "...",
              "analiseOriginal": {
                "motivoSucesso": "...",
                "formulaTitulo": "..."
              },
              "titulosSugeridos": [
                { "titulo": "...", "pontuacao": 9, "explicacao": "..." },
                { "titulo": "...", "pontuacao": 8, "explicacao": "..." },
                { "titulo": "...", "pontuacao": 10, "explicacao": "..." },
                { "titulo": "...", "pontuacao": 7, "explicacao": "..." },
                { "titulo": "...", "pontuacao": 9, "explicacao": "..." }
              ]
            }
        `;
        
        let allGeneratedTitles = [];
        let modelUsedForDisplay = model;
        let finalAnalysisData;
        let finalNicheData;
        
        // --- INÍCIO DA LÓGICA DO DISTRIBUIDOR (SWITCHER) ---
        if (model === 'all') {
            modelUsedForDisplay = 'Comparação (Gemini, Claude, OpenAI)';
            const keysData = await db.all('SELECT service_name, api_key FROM user_api_keys WHERE user_id = ?', [userId]);
            const keys = {};
            keysData.forEach(k => { keys[k.service_name] = decrypt(k.api_key); });

            if (!keys.gemini || !keys.claude || !keys.openai) {
                return res.status(400).json({ msg: 'Para "Comparar", precisa de ter as chaves de Gemini, Claude E OpenAI configuradas.' });
            }

            console.log('[Análise-All] A chamar IA em paralelo...');
            // Usando os modelos específicos para a comparação
            const pGemini = callGeminiAPI(titlePrompt, keys.gemini, 'gemini-2.5-pro');
            const pClaude = callClaudeAPI(titlePrompt, keys.claude, 'claude-3-7-sonnet-20250219');
            const pOpenAI = callOpenAIAPI(titlePrompt, keys.openai, 'gpt-4o');

            const results = await Promise.allSettled([pGemini, pClaude, pOpenAI]);

            let firstSuccessfulAnalysis = null;
            results.forEach((result, index) => {
                let serviceName = ['Gemini', 'Claude', 'OpenAI'][index];
                if (result.status === 'fulfilled') {
                    const parsedData = parseAIResponse(result.value.titles, serviceName);
                    if (!firstSuccessfulAnalysis) firstSuccessfulAnalysis = parsedData;
                    
                    parsedData.titulosSugeridos.forEach(t => {
                        allGeneratedTitles.push({ ...t, titulo: `[${serviceName}] ${t.titulo}`, model: serviceName });
                    });
                } else {
                    console.error(`[Análise-All] Falha com ${serviceName}:`, result.reason.message);
                    allGeneratedTitles.push({
                        titulo: `[${serviceName}] Falhou: ${result.reason.message}`, pontuacao: 0, explicacao: "A API falhou.", model: serviceName
                    });
                }
            });
            
            if (!firstSuccessfulAnalysis) throw new Error("Todas as IAs falharam em retornar uma análise válida.");
            
            // Verificar se a análise tem os dados necessários
            if (!firstSuccessfulAnalysis.analiseOriginal) {
                throw new Error("A IA retornou uma análise incompleta. Verifique as chaves de API e tente novamente.");
            }
            
            // Garantir que o nicho sempre existe (usar padrão se não detectado)
            finalNicheData = { 
                niche: firstSuccessfulAnalysis.niche || 'Entretenimento', 
                subniche: firstSuccessfulAnalysis.subniche || 'N/A' 
            };
            finalAnalysisData = firstSuccessfulAnalysis.analiseOriginal;

        } else {
            // --- LÓGICA DE MODELO ÚNICO ---
            let service;
            if (model.startsWith('gemini')) service = 'gemini';
            else if (model.startsWith('claude')) service = 'claude';
            else if (model.startsWith('gpt')) service = 'openai';
            else service = 'gemini'; // fallback
            
            const userKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, service]);
            if (!userKeyData) return res.status(400).json({ msg: `Nenhuma Chave de API do ${service} configurada.` });
            
            const decryptedKey = decrypt(userKeyData.api_key);
            if (!decryptedKey) return res.status(500).json({ msg: 'Falha ao desencriptar a sua chave de API.' });

            let apiCallFunction;
            if (service === 'gemini') apiCallFunction = callGeminiAPI;
            else if (service === 'claude') apiCallFunction = callClaudeAPI;
            else apiCallFunction = callOpenAIAPI;

            console.log(`[Análise-${service}] A chamar IA...`);
            const response = await apiCallFunction(titlePrompt, decryptedKey, model);
            
            const parsedData = parseAIResponse(response.titles, service);
            
            // Verificar se a análise tem os dados necessários
            if (!parsedData.analiseOriginal) {
                throw new Error("A IA retornou uma análise incompleta. Verifique as chaves de API e tente novamente.");
            }
            
            // Garantir que o nicho sempre existe (usar padrão se não detectado)
            finalNicheData = { 
                niche: parsedData.niche || 'Entretenimento', 
                subniche: parsedData.subniche || 'N/A' 
            };
            finalAnalysisData = parsedData.analiseOriginal;
            allGeneratedTitles = parsedData.titulosSugeridos.map(t => ({ ...t, model: model }));
        }
        // --- FIM DA LÓGICA DO DISTRIBUIDOR ---

        console.log('[Análise] Títulos gerados com sucesso.');

        // --- ETAPA 3: Salvar no Banco de Dados ---
        let analysisId;
        try {
             const analysisResult = await db.run(
                `INSERT INTO analyzed_videos (user_id, folder_id, youtube_video_id, video_url, original_title, translated_title, original_views, original_comments, original_days, original_thumbnail_url, detected_niche, detected_subniche, analysis_data_json, full_transcript) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, folderId || null, videoId, videoUrl, videoDetails.title, translatedTitle, videoDetails.views,
                    videoDetails.comments, videoDetails.days, videoDetails.thumbnailUrl,
                    finalNicheData.niche, finalNicheData.subniche, JSON.stringify(finalAnalysisData), fullTranscript
                ]
            );
            analysisId = analysisResult.lastID;

            for (const titleData of allGeneratedTitles) {
                await db.run(
                    'INSERT INTO generated_titles (video_analysis_id, title_text, model_used, pontuacao, explicacao) VALUES (?, ?, ?, ?, ?)',
                    [analysisId, titleData.titulo, titleData.model, titleData.pontuacao, titleData.explicacao]
                );
            }
            console.log(`[Análise] Análise ${analysisId} salva no histórico (Pasta: ${folderId || 'Nenhuma'}).`);
        } catch (dbErr) {
            console.error("[Análise] FALHA AO SALVAR NO BANCO DE DADOS:", dbErr.message);
        }

        // --- ETAPA 4: Calcular Receita e RPM baseado no nicho ---
        let estimatedRevenueUSD = 0;
        let estimatedRevenueBRL = 0;
        let rpmUSD = 2.0;
        let rpmBRL = 11.0;
        
        try {
            // Calcular receita e RPM sempre, mesmo se o nicho não foi detectado
            const nicheToUse = (finalNicheData && finalNicheData.niche) ? finalNicheData.niche : null;
            const rpm = getRPMByNiche(nicheToUse); // getRPMByNiche retorna padrão se niche for null
            
            // Verificar se rpm foi retornado corretamente
            if (!rpm || typeof rpm !== 'object' || typeof rpm.usd !== 'number' || typeof rpm.brl !== 'number') {
                console.warn('[Análise] RPM inválido, usando valores padrão', { rpm, niche: nicheToUse });
                // Usar valores padrão se rpm for inválido
                const defaultRPM = { usd: 2.0, brl: 11.0 };
                const views = parseInt(videoDetails.views) || 0;
                estimatedRevenueUSD = (views / 1000) * defaultRPM.usd;
                estimatedRevenueBRL = (views / 1000) * defaultRPM.brl;
                rpmUSD = defaultRPM.usd;
                rpmBRL = defaultRPM.brl;
            } else {
                const views = parseInt(videoDetails.views) || 0;
                estimatedRevenueUSD = (views / 1000) * rpm.usd;
                estimatedRevenueBRL = (views / 1000) * rpm.brl;
                rpmUSD = rpm.usd;
                rpmBRL = rpm.brl;
            }
            
            // Garantir que todas as variáveis estão definidas e são números válidos
            if (typeof estimatedRevenueUSD !== 'number' || isNaN(estimatedRevenueUSD)) {
                console.warn('[Análise] estimatedRevenueUSD inválido, recalculando', { estimatedRevenueUSD, rpm, views: videoDetails.views });
                const views = parseInt(videoDetails.views) || 0;
                estimatedRevenueUSD = (views / 1000) * rpm.usd;
                estimatedRevenueBRL = (views / 1000) * rpm.brl;
            }
            
            console.log('[Análise] Receita calculada:', {
                views: videoDetails.views,
                niche: nicheToUse || 'padrão',
                rpmUSD,
                rpmBRL,
                estimatedRevenueUSD: estimatedRevenueUSD.toFixed(2),
                estimatedRevenueBRL: estimatedRevenueBRL.toFixed(2)
            });
        } catch (revenueErr) {
            console.error('[Análise] Erro ao calcular receita:', revenueErr);
            // Usar valores padrão em caso de erro
            const views = parseInt(videoDetails.views) || 0;
            estimatedRevenueUSD = (views / 1000) * 2.0;
            estimatedRevenueBRL = (views / 1000) * 11.0;
            rpmUSD = 2.0;
            rpmBRL = 11.0;
        }

        // --- ETAPA 5: Enviar Resposta (com IDs dos títulos, receita e RPM) ---
        const finalTitlesWithIds = await db.all('SELECT id, title_text as titulo, model_used as model, pontuacao, explicacao, is_checked FROM generated_titles WHERE video_analysis_id = ?', [analysisId]);

        // NÃO salvar automaticamente - apenas quando o usuário marcar o checkbox
        // O salvamento será feito quando o usuário marcar o título como selecionado
        console.log(`[Biblioteca] Títulos gerados aguardando seleção do usuário para salvar na biblioteca`);
        
        // Garantir que todas as variáveis estão definidas antes de enviar
        const responseData = {
            niche: finalNicheData?.niche || 'N/A',
            subniche: finalNicheData?.subniche || 'N/A',
            analiseOriginal: finalAnalysisData || {},
            titulosSugeridos: finalTitlesWithIds || [],
            modelUsed: modelUsedForDisplay || 'N/A', 
            videoDetails: { 
                ...videoDetails, 
                videoId: videoId, 
                translatedTitle: translatedTitle || videoDetails.title,
                estimatedRevenueUSD: typeof estimatedRevenueUSD === 'number' ? estimatedRevenueUSD : 0,
                estimatedRevenueBRL: typeof estimatedRevenueBRL === 'number' ? estimatedRevenueBRL : 0,
                rpmUSD: typeof rpmUSD === 'number' ? rpmUSD : 2.0,
                rpmBRL: typeof rpmBRL === 'number' ? rpmBRL : 11.0
            },
            folderId: folderId || null
        };
        
        // Log para debug
        console.log('[Análise] Enviando resposta:', {
            hasEstimatedRevenueUSD: typeof responseData.videoDetails.estimatedRevenueUSD !== 'undefined',
            estimatedRevenueUSD: responseData.videoDetails.estimatedRevenueUSD,
            hasRpmUSD: typeof responseData.videoDetails.rpmUSD !== 'undefined',
            rpmUSD: responseData.videoDetails.rpmUSD
        });

        res.status(200).json(responseData);

    } catch (err) {
        console.error('[ERRO NA ROTA /api/analyze/titles]:', err);
        res.status(500).json({ msg: err.message || 'Erro interno do servidor ao processar a análise.' });
    }
});

app.put('/api/titles/:titleId/check', authenticateToken, async (req, res) => {
    const { titleId } = req.params;
    const { is_checked } = req.body;
    const userId = req.user.id;

    try {
        // Buscar informações do título antes de atualizar
        const titleData = await db.get(`
            SELECT gt.id, gt.title_text, gt.pontuacao, gt.video_analysis_id, av.detected_niche, av.detected_subniche, av.original_views, av.analysis_data_json
            FROM generated_titles gt
            INNER JOIN analyzed_videos av ON gt.video_analysis_id = av.id
            WHERE gt.id = ? AND av.user_id = ?
        `, [titleId, userId]);

        if (!titleData) {
            return res.status(404).json({ msg: 'Título não encontrado ou não pertence a este utilizador.' });
        }

        // Atualiza o status do título específico
        const result = await db.run(
            `UPDATE generated_titles SET is_checked = ? 
             WHERE id = ? AND video_analysis_id IN (SELECT id FROM analyzed_videos WHERE user_id = ?)`,
            [is_checked, titleId, userId]
        );

        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Título não encontrado ou não pertence a este utilizador.' });
        }

        // Se o título foi marcado (is_checked = true), salvar na biblioteca
        if (is_checked) {
            try {
                const cleanTitle = titleData.title_text.replace(/^\[.*?\]\s*/, ''); // Remove prefixo [Gemini], [Claude], etc
                const analysisData = titleData.analysis_data_json ? JSON.parse(titleData.analysis_data_json) : null;
                
                // Verificar se já existe na biblioteca para evitar duplicatas
                const existing = await db.get(
                    'SELECT id FROM viral_titles_library WHERE user_id = ? AND title = ?',
                    [userId, cleanTitle]
                );

                if (!existing) {
                    await db.run(
                        `INSERT INTO viral_titles_library (user_id, title, niche, subniche, original_views, formula_type, viral_score)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [userId, cleanTitle, titleData.detected_niche, titleData.detected_subniche, titleData.original_views, analysisData?.formulaTitulo || null, titleData.pontuacao || null]
                    );
                    console.log(`[Biblioteca] Título "${cleanTitle.substring(0, 50)}..." salvo na biblioteca`);
                }
            } catch (libErr) {
                console.warn('[Biblioteca] Erro ao salvar título marcado na biblioteca:', libErr.message);
            }
        }

        res.status(200).json({ msg: 'Status do título atualizado.' });
    } catch (err) {
        console.error('Erro ao atualizar status do título:', err);
        res.status(500).json({ msg: 'Erro no servidor.' });
    }
});
app.post('/api/analyze/thumbnail', authenticateToken, async (req, res) => {
    let { videoId, selectedTitle, model, niche, subniche, language, includePhrases, style, customPrompt } = req.body;
    const userId = req.user.id;

    if (!videoId || !selectedTitle || !model || !niche || !subniche || !language || includePhrases === undefined || !style) {
        return res.status(400).json({ msg: 'Dados insuficientes para gerar ideias de thumbnail.' });
    }

    try {
        // --- 1. Identificar serviço e buscar chaves ---
        let service;
        
        if (model === 'all') {
            model = 'gemini-2.0-flash'; 
        }

        if (model.startsWith('gemini')) service = 'gemini';
        else if (model.startsWith('claude')) service = 'claude';
        else if (model.startsWith('gpt')) service = 'openai';
        else service = 'gemini'; // Fallback just in case

        const keyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, service]);
        if (!keyData) return res.status(400).json({ msg: `Chave de API do ${service} não configurada.` });
        const decryptedKey = decrypt(keyData.api_key);
        if (!decryptedKey) return res.status(500).json({ msg: 'Falha ao desencriptar a sua chave de API.' });
        
        const geminiKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, 'gemini']);
        const geminiApiKey = decrypt(geminiKeyData.api_key);
        if (!geminiApiKey) return res.status(400).json({ msg: 'Chave do Gemini (necessária para o YouTube) não encontrada.' });

        // --- 2. Buscar dados do vídeo original ---
        const videoDetails = await callYouTubeDataAPI(videoId, geminiApiKey);
        
        // --- 2.5. Buscar análise original para pegar a fórmula do título ---
        let formulaTitulo = null;
        let motivoSucesso = null;
        try {
            const originalAnalysis = await db.get(
                'SELECT analysis_data_json FROM analyzed_videos WHERE youtube_video_id = ? AND user_id = ? ORDER BY analyzed_at DESC LIMIT 1',
                [videoId, userId]
            );
            if (originalAnalysis && originalAnalysis.analysis_data_json) {
                const analysisData = JSON.parse(originalAnalysis.analysis_data_json);
                if (analysisData.formulaTitulo) {
                    formulaTitulo = analysisData.formulaTitulo;
                }
                if (analysisData.motivoSucesso) {
                    motivoSucesso = analysisData.motivoSucesso;
                }
            }
        } catch (err) {
            console.warn(`[Análise-Thumb] Não foi possível buscar análise original: ${err.message}`);
        }
        
        // --- 3. Criar o prompt multimodal (PROMPT REFINADO ou CUSTOMIZADO) ---
        let thumbPrompt;
        
        if (customPrompt && customPrompt.trim()) {
            // Se houver prompt customizado, usar ele como base
            thumbPrompt = `
            Você é um especialista em YouTube, combinando as habilidades de um diretor de arte para thumbnails e um mestre de SEO.

            IMAGEM DE REFERÊNCIA: [A imagem da thumbnail original do vídeo está anexada]
            TÍTULO DO VÍDEO (para contexto): "${selectedTitle}"
            SUBNICHO (Público-Alvo): "${subniche}"
            ESTILO DE ARTE DESEJADO: "${style}"
            IDIOMA DO CONTEÚDO: "${language}"

            PROMPT PERSONALIZADO DO USUÁRIO:
            ${customPrompt}

            ⚠️ ATENÇÃO CRÍTICA: As thumbnails DEVEM parecer FOTOGRAFIAS REAIS, não ilustrações, desenhos ou renderizações. A descriçãoThumbnail deve descrever uma FOTO REAL tirada por um fotógrafo profissional em um local real, com pessoas reais e objetos reais.
            
            🎯 OBJETIVO: Criar thumbnails otimizadas para CTR acima de 25% usando técnicas de Thumbnail Designer profissional:
            - TEXTO PROFISSIONAL (COMO PHOTOSHOP): O texto DEVE parecer feito no Photoshop por um designer profissional. Use múltiplos efeitos de camada (stroke, drop shadow com valores específicos, outer glow, bevel and emboss), tipografia profissional com kerning perfeito, renderização profissional com anti-aliasing. Grande, estilizado, cores vibrantes (amarelo/vermelho/branco com outline preto), efeitos visuais profissionais com valores específicos (distância, spread, tamanho, opacidade, ângulo), posicionamento estratégico (topo/centro), ocupando 25-35% da imagem. O texto DEVE ter qualidade de agência de design, não amador.
            - COMPOSIÇÃO: Regra dos terços, hierarquia visual clara, elemento principal em destaque
            - CORES: Alto contraste, cores complementares, saturação otimizada, fundo que faz o texto "pular"
            - EMOÇÃO: Expressões faciais intensas, momentos de tensão, curiosidade visual
            - ELEMENTOS VIRAIS: FOMO (medo de perder), surpresa, contraste dramático, storytelling visual
            
            SUA TAREFA:
            Crie DUAS (2) ideias distintas para uma nova thumbnail baseadas no prompt personalizado acima.
            - **IDEIA 1 (Melhoria):** Analise a thumbnail de referência e proponha uma versão melhorada seguindo o prompt personalizado. LEMBRE-SE: Deve ser descrito como uma FOTO REAL, não uma ilustração. O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada e valores específicos.
            - **IDEIA 2 (Inovação):** Crie um conceito completamente novo seguindo o prompt personalizado. LEMBRE-SE: Deve ser descrito como uma FOTO REAL, não uma ilustração. O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada e valores específicos.

            PARA CADA UMA DAS 2 IDEIAS, GERE:
            1.  **"seoDescription"**: Uma descrição de vídeo para o YouTube, otimizada para SEO, com parágrafos bem estruturados, chamadas para ação e uso de palavras-chave relevantes para o título e subnicho. A descrição deve estar no idioma "${language}".
            2.  **"seoTags"**: Um array de strings com as 10 a 15 tags mais relevantes para o vídeo, misturando termos de cauda curta e longa.
            3.  **"frasesDeGancho"**: Um array com 5 frases CURTAS de impacto (ganchos) para a thumbnail, no idioma "${language}". ${!includePhrases ? 'IMPORTANTE: Retorne um array vazio [].' : ''}
            4.  **"descricaoThumbnail"**: Um prompt EXTREMAMENTE DETALHADO e VÍVIDO, em INGLÊS, para uma IA de geração de imagem. ${!includePhrases ? 'NÃO inclua nenhum placeholder para texto. A thumbnail deve ser APENAS imagem, sem texto ou frases de gancho.' : 'A descrição DEVE incluir um placeholder claro, como "[FRASE DE GANCHO AQUI]", onde o texto da thumbnail deve ser inserido. CRÍTICO: Quando mencionar o texto, descreva-o como se fosse criado no Photoshop por um designer profissional: use termos como "Professional Photoshop-quality text design", "professional layer effects", "Photoshop stroke effect", "professional drop shadow with specific values (distance, spread, size, opacity, angle)", "professional outer glow", "professional bevel and emboss", "professional typography with perfect kerning", "professional text rendering with anti-aliasing", "looks like it was designed by a professional graphic designer". O texto DEVE ter múltiplos efeitos de camada do Photoshop com valores específicos, não apenas descrições genéricas. Fonte estilizada profissional, grande e impactante, cores vibrantes e contrastantes, efeitos visuais profissionais (sombra com valores específicos, brilho, outline, gradiente), posicionamento estratégico, tamanho grande que ocupa 25-35% da imagem.'}
            
            CRÍTICO PARA A "descricaoThumbnail" - DEVE SER FOTOGRAFIA REAL, NÃO ILUSTRAÇÃO:
            - OBRIGATÓRIO: A descrição DEVE começar EXATAMENTE com: "Ultra-high-definition (8K) professional photograph, captured with a world-class professional camera (Arri Alexa 65, Red Komodo, or Canon EOS R5), shot on location, real-world photography, documentary photography, photorealistic, hyper-realistic, absolutely no illustration, no drawing, no cartoon, no artwork, no digital art, no render, no 3D, no CGI, no stylized, no artistic interpretation, real photograph of real people and real objects, National Geographic documentary quality, BBC documentary style, real textures, real imperfections, real lighting, real shadows, real depth of field, real bokeh, real camera grain, real color grading, real-world photography"
            - ENFATIZE REPETIDAMENTE: "real photograph", "shot on location", "documentary photography", "realistic textures with imperfections", "natural lighting with real shadows", "real depth of field", "real bokeh effects", "professional color grading", "high dynamic range (HDR)", "sharp focus on subject", "real camera grain", "real-world photography", "actual photograph", "photographed in real life", "real person", "real object", "real environment"
            - NUNCA, JAMAIS use estes termos: "illustration", "drawing", "artwork", "digital art", "render", "3D render", "CGI", "cartoon", "anime", "sketch", "painting", "stylized", "artistic", "concept art", "digital painting", "graphic design", "vector", "comic", "fantasy art"
            - SEMPRE use APENAS estes termos: "photograph", "photo", "photography", "shot", "captured", "documentary photo", "realistic capture", "professional photography", "real-world photography", "actual photograph", "photographed", "real-life photography", "on-location photography"
            - IMPORTANTE: Descreva como se fosse uma FOTO REAL tirada por um fotógrafo profissional. Mencione detalhes realistas como: "real skin texture with pores", "real fabric texture", "real stone texture with weathering", "real shadows cast by real light sources", "real depth of field blur", "real camera lens distortion", "real chromatic aberration", "real lens flare", "real motion blur if applicable"

            REGRAS IMPORTANTES:
            - A "descricaoThumbnail" é OBRIGATORIAMENTE em INGLÊS.
            - "seoDescription", "seoTags" e "frasesDeGancho" são OBRIGATORIAMENTE no idioma "${language}".
            ${!includePhrases ? '- IMPORTANTE: A "descricaoThumbnail" NÃO deve mencionar texto, palavras ou frases. Apenas descreva elementos visuais, composição, cores, iluminação, etc.' : ''}
            - Seja extremamente específico e detalhado nas descrições visuais. Use termos técnicos de fotografia profissional, cinematografia e psicologia visual quando apropriado.
            - Foque em elementos que maximizem CTR: expressões faciais intensas, momentos de tensão, curiosidade visual, contraste dramático, composição impactante.
            
            EXEMPLOS DE COMO DESCREVER PARA GARANTIR REALISMO:
            - Em vez de "um guerreiro maia", escreva: "a real person dressed as a Mayan warrior, photographed on location, real skin texture with pores and natural imperfections, real fabric of the costume with visible texture and wrinkles, real feathers in the headdress with natural variations"
            - Em vez de "uma pirâmide antiga", escreva: "a real ancient Mayan pyramid photographed on location, real weathered stone with cracks and imperfections, real moss and vegetation growing on the stones, real shadows cast by the sun, real depth of field blur in the background"
            - Em vez de "luz mística", escreva: "real natural lighting from the sun, real shadows cast by real objects, real depth of field, real bokeh in the background, real camera lens flare if the sun is in frame"
            - SEMPRE mencione: "real", "actual", "photographed", "shot on location", "documentary style", "real-world", "actual photograph"
            
            TÉCNICAS DE THUMBNAIL VIRAL PARA O TEXTO (quando includePhrases = true) - DESIGN PROFISSIONAL COMO PHOTOSHOP - CTR ACIMA DE 25%:
            
            📝 DESCRIÇÃO OBRIGATÓRIA DO TEXTO - DEVE PARECER FEITO NO PHOTOSHOP POR UM DESIGNER PROFISSIONAL:
            O texto DEVE ser descrito como se fosse criado no Photoshop com técnicas profissionais de design gráfico:
            
            1. TIPOGRAFIA PROFISSIONAL:
               - "Professional typography, Photoshop-quality text design"
               - "Large, bold, professionally designed text occupying 25-35% of the image height"
               - "Massive, oversized typography with professional letter spacing and kerning"
               - "Thick, chunky, professionally rendered letters"
               - "Typography that looks like it was designed by a professional graphic designer"
               - "High-end text design, magazine-quality typography"
            
            2. CORES PROFISSIONAIS E EFEITOS DE CAMADA (Layer Effects do Photoshop):
               - "Bright yellow (#FFD700) text with professional Photoshop layer effects: thick black stroke (6-8px), white drop shadow with distance 8px, spread 5px, size 12px, opacity 80%, angle 135 degrees"
               - "Pure white text with professional red stroke (6px), black drop shadow with blur radius 10px, and subtle outer glow effect in yellow"
               - "Neon orange (#FF6600) text with black stroke (7px), professional drop shadow with multiple layers, and yellow outer glow with spread 8px"
               - "Electric blue (#00FFFF) text with white stroke (6px), black shadow with distance 10px, and professional bevel and emboss effect"
               - "Bright red (#FF0000) text with yellow stroke (5px), white drop shadow, and professional gradient overlay from yellow to orange"
               - "Lime green (#00FF00) text with black stroke (8px), white glow effect, and professional inner shadow"
               - IMPORTANTE: Descreva como efeitos de camada do Photoshop (layer effects), não apenas "outline" ou "shadow"
            
            3. FONTES PROFISSIONAIS:
               - "Professional bold sans-serif font (Impact, Bebas Neue, Montserrat Black, or similar premium font)"
               - "Thick, chunky, professionally designed block letters"
               - "Modern, high-end typography with perfect letter spacing"
               - "YouTube viral thumbnail professional font style"
               - "Bold, condensed font with professional kerning and tracking"
               - "Premium typography, no serifs, maximum readability, professional design"
               - "Typography that looks like it came from a professional design agency"
            
            4. EFEITOS PROFISSIONAIS DO PHOTOSHOP (Layer Styles):
               - "Professional Photoshop stroke effect: thick black outline (6-8px width), position: outside, blend mode: normal, opacity: 100%"
               - "Professional drop shadow: distance 10px, spread 5px, size 12px, angle 135°, opacity 80%, color black, blend mode: multiply"
               - "Professional outer glow effect: spread 8px, size 15px, opacity 75%, color matching text or contrasting"
               - "Professional bevel and emboss effect: style: emboss, technique: smooth, depth 100%, size 5px, softness 2px"
               - "Professional gradient overlay: linear gradient from bright color to darker shade, angle 90°, opacity 80%"
               - "Professional inner shadow: distance 3px, choke 0%, size 5px, opacity 60%"
               - "Professional color overlay: solid color with blend mode overlay or soft light, opacity 50%"
               - "Text appears to pop out from the image with professional 3D effect"
               - "Professional text rendering with anti-aliasing, crisp edges, perfect clarity"
            
            5. COMPOSIÇÃO PROFISSIONAL:
               - "Positioned at the top center of the image with professional alignment"
               - "Bottom third of the image with professional composition and high contrast background"
               - "Centered horizontally, upper third vertically, following rule of thirds"
               - "Strategically placed to not cover important visual elements, professional layout"
               - "Text area has professional semi-transparent dark background (black overlay with 40% opacity) for better readability"
               - "Professional text box or banner behind text with gradient or solid color, rounded corners optional"
            
            6. CONTRASTE E VISIBILIDADE PROFISSIONAL:
               - "High contrast against the background, professionally optimized"
               - "Text stands out dramatically from the image with professional design techniques"
               - "Eye-catching text overlay that immediately draws attention, professional composition"
               - "Text that pops from the image with maximum visibility, professional rendering"
               - "Text is the first thing the eye is drawn to, professional visual hierarchy"
               - "Background is professionally darkened (vignette effect) or lightened behind text for maximum contrast"
               - "Professional color grading applied to background to make text stand out"
            
            7. EXEMPLO COMPLETO DE DESCRIÇÃO PROFISSIONAL:
               "Professional Photoshop-quality text design: Large, bold, stylized text '[FRASE DE GANCHO AQUI]' in bright yellow (#FFD700) with professional layer effects: thick black stroke (7px width, position outside), white drop shadow (distance 10px, spread 5px, size 12px, opacity 80%, angle 135°), subtle outer glow in white (spread 6px, size 10px, opacity 70%), positioned at the top center of the image, occupying 30% of the image height, professional bold sans-serif font (Impact or Bebas Neue style), thick chunky letters with perfect kerning, professional text rendering with anti-aliasing and crisp edges, high contrast viral thumbnail text style, eye-catching and attention-grabbing, text appears to pop out from the image with professional 3D effect, maximum visibility for high CTR, looks like it was designed by a professional graphic designer in Photoshop"
            
            8. REGRAS DE OURO PARA DESIGN PROFISSIONAL:
               - O texto DEVE parecer feito no Photoshop por um designer profissional
               - O texto DEVE ter múltiplos efeitos de camada (stroke, shadow, glow, bevel)
               - O texto DEVE ter valores específicos de efeitos (distância, spread, tamanho, opacidade)
               - O texto DEVE ter tipografia profissional com kerning e tracking perfeitos
               - O texto DEVE ter renderização profissional (anti-aliasing, crisp edges)
               - O texto DEVE ter composição profissional (regra dos terços, hierarquia visual)
               - O texto DEVE parecer de qualidade de agência de design, não amador

            RESPONDA APENAS COM UM OBJETO JSON VÁLIDO, com a seguinte estrutura:
            {
              "ideias": [
                {
                  "seoDescription": "Descrição completa e otimizada para o YouTube aqui...",
                  "seoTags": ["tag1", "tag2", "tag3", ...],
                  "frasesDeGancho": ${includePhrases ? '["Frase 1", "Frase 2", "Frase 3", "Frase 4", "Frase 5"]' : '[]'},
                  "descricaoThumbnail": "${includePhrases ? 'A detailed visual prompt in English with the placeholder [FRASE DE GANCHO AQUI]...' : 'A detailed visual prompt in English WITHOUT any text or phrases, only visual elements...'}"
                },
                {
                  "seoDescription": "Outra descrição completa e otimizada...",
                  "seoTags": ["tagA", "tagB", "tagC", ...],
                  "frasesDeGancho": ${includePhrases ? '["Outra Frase 1", "Outra Frase 2", "Outra Frase 3", "Outra Frase 4", "Outra Frase 5"]' : '[]'},
                  "descricaoThumbnail": "${includePhrases ? 'Another detailed visual prompt in English with the placeholder [FRASE DE GANCHO AQUI]...' : 'Another detailed visual prompt in English WITHOUT any text or phrases, only visual elements...'}"
                }
              ]
            }
        `;
        } else {
            // Prompt padrão baseado na fórmula do título e otimizado por modelo
            const formulaContext = formulaTitulo ? `\n            FÓRMULA DO TÍTULO VIRAL IDENTIFICADA: "${formulaTitulo}"\n            MOTIVO DO SUCESSO: "${motivoSucesso || 'Análise não disponível'}"\n            \n            IMPORTANTE: Use esta fórmula como base para criar thumbnails que complementem e reforcem o mesmo gatilho mental e estratégia que tornaram o título viral.` : '';
            
            // Contexto de performance do vídeo - usar mesma classificação viral
            const viewsPerDayThumb = videoDetails.views && videoDetails.days 
                ? Math.round(videoDetails.views / Math.max(videoDetails.days, 1))
                : 0;
            const isViralThumb = isViralVideo(videoDetails.views || 0, videoDetails.days || 0, viewsPerDayThumb);
            
            const videoPerformanceContext = isViralThumb
                ? (videoDetails.views && videoDetails.days 
                    ? `\n            🚀 CONTEXTO DO VÍDEO VIRAL:\n            Esta thumbnail VIRALIZOU junto com o vídeo que alcançou ${videoDetails.views.toLocaleString()} views em apenas ${videoDetails.days} dias (média de ${viewsPerDayThumb.toLocaleString()} views/dia). Esta thumbnail foi parte do sucesso viral e precisa ser adaptada para o seu subnicho mantendo o mesmo poder de viralização.`
                    : `\n            🚀 CONTEXTO DO VÍDEO VIRAL:\n            Esta thumbnail VIRALIZOU junto com o vídeo que alcançou ${videoDetails.views.toLocaleString()} views. Esta thumbnail foi parte do sucesso viral e precisa ser adaptada para o seu subnicho mantendo o mesmo poder de viralização.`)
                : (videoDetails.views && videoDetails.days 
                    ? `\n            🚀 CONTEXTO DO VÍDEO DE REFERÊNCIA:\n            Esta thumbnail pertence a um vídeo que alcançou ${videoDetails.views.toLocaleString()} views em ${videoDetails.days} dias (média de ${viewsPerDayThumb.toLocaleString()} views/dia). Este vídeo NÃO viralizou, mas a thumbnail pode ser analisada e melhorada para criar versões com maior potencial viral.`
                    : `\n            🚀 CONTEXTO DO VÍDEO DE REFERÊNCIA:\n            Esta thumbnail pertence a um vídeo que alcançou ${videoDetails.views.toLocaleString()} views. Este vídeo NÃO viralizou, mas a thumbnail pode ser analisada e melhorada para criar versões com maior potencial viral.`);
            
            // Prompts otimizados por modelo
            if (service === 'gemini') {
                thumbPrompt = `
            Você é um ESPECIALISTA EM THUMBNAILS VIRAIS NO YOUTUBE, combinando as habilidades de um diretor de arte profissional e um estrategista de viralização com experiência em criar thumbnails que geram MILHÕES DE VIEWS e ALTO CTR (acima de 25%).${formulaContext}${videoPerformanceContext}

            🎯 PROMPT DE ANÁLISE DE THUMBS (DIRETO DO VÍDEO VIRAL):
            Este vídeo ${isViralThumb ? 'COM ESTA THUMBNAIL VIRALIZOU' : 'DE REFERÊNCIA tem esta thumbnail'}, com o título: "${videoDetails.title}"
            
            OBJETIVO: Criar thumbnails que gerem MILHÕES DE VIEWS e ALTO CTR (acima de 25%) para canais milionários.
            
            Quero que você me dê uma ADAPTAÇÃO para meu SUBNICHO de "${subniche}" com o título: "${selectedTitle}"
            
            REGRAS CRÍTICAS:
            - Mantenha o PODER VIRAL da thumbnail original que gerou milhões de views
            - Adapte para o meu subnicho e título, mas SEMPRE mantenha a capacidade de gerar alto CTR e milhões de views
            - Analise PROFUNDAMENTE o que tornou a thumbnail original viral (composição, cores, elementos visuais, expressões, texto, contraste, psicologia visual)
            - Identifique os ELEMENTOS VIRAIS COMPROVADOS que funcionaram e mantenha-os na adaptação
            - Melhore o que for possível (cores mais vibrantes, contraste maior, composição mais impactante, iluminação mais dramática)
            - Crie thumbnails que TENHAM POTENCIAL PARA VIRALIZAR e gerar milhões de views como a original

            IMAGEM DE REFERÊNCIA: [A imagem da thumbnail original do vídeo VIRAL está anexada - analise cuidadosamente o que tornou esta thumbnail viral e gerou milhões de views]${formulaContext}

            IMAGEM DE REFERÊNCIA: [A imagem da thumbnail original do vídeo está anexada]
            TÍTULO DO VÍDEO (para contexto): "${selectedTitle}"
            SUBNICHO (Público-Alvo): "${subniche}"
            ESTILO DE ARTE DESEJADO: "${style}"
            IDIOMA DO CONTEÚDO: "${language}"

            ⚠️ ATENÇÃO CRÍTICA: As thumbnails DEVEM parecer FOTOGRAFIAS REAIS, não ilustrações, desenhos ou renderizações. A descriçãoThumbnail deve descrever uma FOTO REAL tirada por um fotógrafo profissional em um local real, com pessoas reais e objetos reais.
            
            🎯 OBJETIVO: Criar thumbnails otimizadas para CTR acima de 25% usando técnicas de Thumbnail Designer profissional:
            - TEXTO PROFISSIONAL (COMO PHOTOSHOP): O texto DEVE parecer feito no Photoshop por um designer profissional. Use múltiplos efeitos de camada (stroke, drop shadow com valores específicos, outer glow, bevel and emboss), tipografia profissional com kerning perfeito, renderização profissional com anti-aliasing. Grande, estilizado, cores vibrantes (amarelo/vermelho/branco com outline preto), efeitos visuais profissionais com valores específicos (distância, spread, tamanho, opacidade, ângulo), posicionamento estratégico (topo/centro), ocupando 25-35% da imagem. O texto DEVE ter qualidade de agência de design, não amador.
            - COMPOSIÇÃO: Regra dos terços, hierarquia visual clara, elemento principal em destaque
            - CORES: Alto contraste, cores complementares, saturação otimizada, fundo que faz o texto "pular"
            - EMOÇÃO: Expressões faciais intensas, momentos de tensão, curiosidade visual
            - ELEMENTOS VIRAIS: FOMO (medo de perder), surpresa, contraste dramático, storytelling visual
            
            SUA TAREFA (OTIMIZADA PARA VIRALIZAÇÃO - GEMINI):
            Analise a thumbnail VIRAL de referência e crie DUAS (2) adaptações que mantenham o PODER VIRAL original, mas adaptadas para o subnicho "${subniche}" e o título "${selectedTitle}".
            
            - **IDEIA 1 (Adaptação Estratégica Mantendo o Poder Viral):** 
              Analise PROFUNDAMENTE a thumbnail viral de referência e identifique:
              * O que tornou esta thumbnail viral? (composição, cores, elementos visuais, expressões, texto, contraste)
              * Quais elementos visuais geraram curiosidade e cliques?
              * Qual foi a estratégia emocional que funcionou?
              
              Agora, crie uma ADAPTAÇÃO para o subnicho "${subniche}" e título "${selectedTitle}" que:
              * MANTENHA os elementos virais que funcionaram (composição similar, estratégia emocional, contraste)
              * ADAPTE os elementos visuais para o seu subnicho (personagens, objetos, cenários relevantes)
              * MELHORE o que for possível (cores mais vibrantes, contraste maior, composição mais impactante)
              * MANTENHA o mesmo PODER VIRAL da original
              
              LEMBRE-SE: Deve ser descrito como uma FOTO REAL, não uma ilustração. O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada (stroke, drop shadow com valores específicos, outer glow, bevel and emboss) e tipografia profissional.
            
            - **IDEIA 2 (Inovação Viral com Elementos do Original):** 
              Crie um conceito COMPLETAMENTE NOVO que:
              * USE os GATILHOS VIRAIS identificados na thumbnail original (curiosidade, FOMO, surpresa, contraste)
              * ADAPTE para o subnicho "${subniche}" com elementos visuais relevantes
              * OTIMIZE para o título "${selectedTitle}" destacando palavras-chave visuais
              * SEJA AINDA MAIS IMPACTANTE que a original (cores mais vibrantes, contraste maior, composição mais dramática)
              * GERE MAIS CURIOSIDADE e CLIQUE que a original
              
              Foque em: 
              * Curiosidade extrema (elementos misteriosos, surpreendentes, inusitados)
              * Emoção intensa (expressões faciais dramáticas, momentos de tensão máxima)
              * Contraste visual máximo (cores vibrantes vs. fundo neutro, luz vs. sombra dramática)
              * FOMO máximo (medo de perder algo, urgência visual, exclusividade)
              * Storytelling visual (conta uma história que prende a atenção)
              
              LEMBRE-SE: Deve ser descrito como uma FOTO REAL, não uma ilustração. O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada (stroke, drop shadow com valores específicos, outer glow, bevel and emboss) e tipografia profissional.

            PARA CADA UMA DAS 2 IDEIAS, GERE:
            1.  **"seoDescription"**: Uma descrição de vídeo para o YouTube, otimizada para SEO, com parágrafos bem estruturados, chamadas para ação e uso de palavras-chave relevantes para o título e subnicho. A descrição deve estar no idioma "${language}".
            2.  **"seoTags"**: Um array de strings com as 10 a 15 tags mais relevantes para o vídeo, misturando termos de cauda curta e longa.
            3.  **"frasesDeGancho"**: Um array com 5 frases CURTAS de impacto (ganchos) para a thumbnail, no idioma "${language}". ${!includePhrases ? 'IMPORTANTE: Retorne um array vazio [].' : ''}
            4.  **"descricaoThumbnail"**: Um prompt EXTREMAMENTE DETALHADO e VÍVIDO, em INGLÊS, para uma IA de geração de imagem. ${!includePhrases ? 'NÃO inclua nenhum placeholder para texto. A thumbnail deve ser APENAS imagem, sem texto ou frases de gancho. Descreva apenas elementos visuais, composição, cores, iluminação, etc.' : 'A descrição DEVE incluir um placeholder claro, como "[FRASE DE GANCHO AQUI]", onde o texto da thumbnail deve ser inserido.'}
            
            CRÍTICO PARA A "descricaoThumbnail" - DEVE SER FOTOGRAFIA REAL, NÃO ILUSTRAÇÃO:
            - OBRIGATÓRIO: A descrição DEVE começar EXATAMENTE com: "Ultra-high-definition (8K) professional photograph, captured with a world-class professional camera (Arri Alexa 65, Red Komodo, or Canon EOS R5), shot on location, real-world photography, documentary photography, photorealistic, hyper-realistic, absolutely no illustration, no drawing, no cartoon, no artwork, no digital art, no render, no 3D, no CGI, no stylized, no artistic interpretation, real photograph of real people and real objects, National Geographic documentary quality, BBC documentary style, real textures, real imperfections, real lighting, real shadows, real depth of field, real bokeh, real camera grain, real color grading, real-world photography"
            - ENFATIZE REPETIDAMENTE: "real photograph", "shot on location", "documentary photography", "realistic textures with imperfections", "natural lighting with real shadows", "real depth of field", "real bokeh effects", "professional color grading", "high dynamic range (HDR)", "sharp focus on subject", "real camera grain", "real-world photography", "actual photograph", "photographed in real life", "real person", "real object", "real environment"
            - NUNCA, JAMAIS use estes termos: "illustration", "drawing", "artwork", "digital art", "render", "3D render", "CGI", "cartoon", "anime", "sketch", "painting", "stylized", "artistic", "concept art", "digital painting", "graphic design", "vector", "comic", "fantasy art"
            - SEMPRE use APENAS estes termos: "photograph", "photo", "photography", "shot", "captured", "documentary photo", "realistic capture", "professional photography", "real-world photography", "actual photograph", "photographed", "real-life photography", "on-location photography"
            - IMPORTANTE: Descreva como se fosse uma FOTO REAL tirada por um fotógrafo profissional. Mencione detalhes realistas como: "real skin texture with pores", "real fabric texture", "real stone texture with weathering", "real shadows cast by real light sources", "real depth of field blur", "real camera lens distortion", "real chromatic aberration", "real lens flare", "real motion blur if applicable"

            REGRAS IMPORTANTES:
            - A "descricaoThumbnail" é OBRIGATORIAMENTE em INGLÊS.
            - "seoDescription", "seoTags" e "frasesDeGancho" são OBRIGATORIAMENTE no idioma "${language}".
            ${!includePhrases ? '- IMPORTANTE: A "descricaoThumbnail" NÃO deve mencionar texto, palavras ou frases. Apenas descreva elementos visuais, composição, cores, iluminação, etc.' : ''}
            - Seja extremamente específico e detalhado nas descrições visuais. Use termos técnicos de fotografia profissional, cinematografia e psicologia visual quando apropriado.
            - Foque em elementos que maximizem CTR: expressões faciais intensas, momentos de tensão, curiosidade visual, contraste dramático, composição impactante.
            
            EXEMPLOS DE COMO DESCREVER PARA GARANTIR REALISMO:
            - Em vez de "um guerreiro maia", escreva: "a real person dressed as a Mayan warrior, photographed on location, real skin texture with pores and natural imperfections, real fabric of the costume with visible texture and wrinkles, real feathers in the headdress with natural variations"
            - Em vez de "uma pirâmide antiga", escreva: "a real ancient Mayan pyramid photographed on location, real weathered stone with cracks and imperfections, real moss and vegetation growing on the stones, real shadows cast by the sun, real depth of field blur in the background"
            - Em vez de "luz mística", escreva: "real natural lighting from the sun, real shadows cast by real objects, real depth of field, real bokeh in the background, real camera lens flare if the sun is in frame"
            - SEMPRE mencione: "real", "actual", "photographed", "shot on location", "documentary style", "real-world", "actual photograph"
            
            TÉCNICAS DE THUMBNAIL VIRAL PARA O TEXTO (quando includePhrases = true) - DESIGN PROFISSIONAL COMO PHOTOSHOP - CTR ACIMA DE 25%:
            
            📝 DESCRIÇÃO OBRIGATÓRIA DO TEXTO - DEVE PARECER FEITO NO PHOTOSHOP POR UM DESIGNER PROFISSIONAL:
            O texto DEVE ser descrito como se fosse criado no Photoshop com técnicas profissionais de design gráfico:
            
            1. TIPOGRAFIA PROFISSIONAL:
               - "Professional typography, Photoshop-quality text design"
               - "Large, bold, professionally designed text occupying 25-35% of the image height"
               - "Massive, oversized typography with professional letter spacing and kerning"
               - "Thick, chunky, professionally rendered letters"
               - "Typography that looks like it was designed by a professional graphic designer"
               - "High-end text design, magazine-quality typography"
            
            2. CORES PROFISSIONAIS E EFEITOS DE CAMADA (Layer Effects do Photoshop):
               - "Bright yellow (#FFD700) text with professional Photoshop layer effects: thick black stroke (6-8px), white drop shadow with distance 8px, spread 5px, size 12px, opacity 80%, angle 135 degrees"
               - "Pure white text with professional red stroke (6px), black drop shadow with blur radius 10px, and subtle outer glow effect in yellow"
               - "Neon orange (#FF6600) text with black stroke (7px), professional drop shadow with multiple layers, and yellow outer glow with spread 8px"
               - "Electric blue (#00FFFF) text with white stroke (6px), black shadow with distance 10px, and professional bevel and emboss effect"
               - "Bright red (#FF0000) text with yellow stroke (5px), white drop shadow, and professional gradient overlay from yellow to orange"
               - "Lime green (#00FF00) text with black stroke (8px), white glow effect, and professional inner shadow"
               - IMPORTANTE: Descreva como efeitos de camada do Photoshop (layer effects), não apenas "outline" ou "shadow"
            
            3. FONTES PROFISSIONAIS:
               - "Professional bold sans-serif font (Impact, Bebas Neue, Montserrat Black, or similar premium font)"
               - "Thick, chunky, professionally designed block letters"
               - "Modern, high-end typography with perfect letter spacing"
               - "YouTube viral thumbnail professional font style"
               - "Bold, condensed font with professional kerning and tracking"
               - "Premium typography, no serifs, maximum readability, professional design"
               - "Typography that looks like it came from a professional design agency"
            
            4. EFEITOS PROFISSIONAIS DO PHOTOSHOP (Layer Styles):
               - "Professional Photoshop stroke effect: thick black outline (6-8px width), position: outside, blend mode: normal, opacity: 100%"
               - "Professional drop shadow: distance 10px, spread 5px, size 12px, angle 135°, opacity 80%, color black, blend mode: multiply"
               - "Professional outer glow effect: spread 8px, size 15px, opacity 75%, color matching text or contrasting"
               - "Professional bevel and emboss effect: style: emboss, technique: smooth, depth 100%, size 5px, softness 2px"
               - "Professional gradient overlay: linear gradient from bright color to darker shade, angle 90°, opacity 80%"
               - "Professional inner shadow: distance 3px, choke 0%, size 5px, opacity 60%"
               - "Professional color overlay: solid color with blend mode overlay or soft light, opacity 50%"
               - "Text appears to pop out from the image with professional 3D effect"
               - "Professional text rendering with anti-aliasing, crisp edges, perfect clarity"
            
            5. COMPOSIÇÃO PROFISSIONAL:
               - "Positioned at the top center of the image with professional alignment"
               - "Bottom third of the image with professional composition and high contrast background"
               - "Centered horizontally, upper third vertically, following rule of thirds"
               - "Strategically placed to not cover important visual elements, professional layout"
               - "Text area has professional semi-transparent dark background (black overlay with 40% opacity) for better readability"
               - "Professional text box or banner behind text with gradient or solid color, rounded corners optional"
            
            6. CONTRASTE E VISIBILIDADE PROFISSIONAL:
               - "High contrast against the background, professionally optimized"
               - "Text stands out dramatically from the image with professional design techniques"
               - "Eye-catching text overlay that immediately draws attention, professional composition"
               - "Text that pops from the image with maximum visibility, professional rendering"
               - "Text is the first thing the eye is drawn to, professional visual hierarchy"
               - "Background is professionally darkened (vignette effect) or lightened behind text for maximum contrast"
               - "Professional color grading applied to background to make text stand out"
            
            7. EXEMPLO COMPLETO DE DESCRIÇÃO PROFISSIONAL:
               "Professional Photoshop-quality text design: Large, bold, stylized text '[FRASE DE GANCHO AQUI]' in bright yellow (#FFD700) with professional layer effects: thick black stroke (7px width, position outside), white drop shadow (distance 10px, spread 5px, size 12px, opacity 80%, angle 135°), subtle outer glow in white (spread 6px, size 10px, opacity 70%), positioned at the top center of the image, occupying 30% of the image height, professional bold sans-serif font (Impact or Bebas Neue style), thick chunky letters with perfect kerning, professional text rendering with anti-aliasing and crisp edges, high contrast viral thumbnail text style, eye-catching and attention-grabbing, text appears to pop out from the image with professional 3D effect, maximum visibility for high CTR, looks like it was designed by a professional graphic designer in Photoshop"
            
            8. REGRAS DE OURO PARA DESIGN PROFISSIONAL:
               - O texto DEVE parecer feito no Photoshop por um designer profissional
               - O texto DEVE ter múltiplos efeitos de camada (stroke, shadow, glow, bevel)
               - O texto DEVE ter valores específicos de efeitos (distância, spread, tamanho, opacidade)
               - O texto DEVE ter tipografia profissional com kerning e tracking perfeitos
               - O texto DEVE ter renderização profissional (anti-aliasing, crisp edges)
               - O texto DEVE ter composição profissional (regra dos terços, hierarquia visual)
               - O texto DEVE parecer de qualidade de agência de design, não amador

            RESPONDA APENAS COM UM OBJETO JSON VÁLIDO, com a seguinte estrutura:
            {
              "ideias": [
                {
                  "seoDescription": "Descrição completa e otimizada para o YouTube aqui...",
                  "seoTags": ["tag1", "tag2", "tag3", ...],
                  "frasesDeGancho": ${includePhrases ? '["Frase 1", "Frase 2", "Frase 3", "Frase 4", "Frase 5"]' : '[]'},
                  "descricaoThumbnail": "${includePhrases ? 'A detailed visual prompt in English with the placeholder [FRASE DE GANCHO AQUI]...' : 'A detailed visual prompt in English WITHOUT any text or phrases, only visual elements...'}"
                },
                {
                  "seoDescription": "Outra descrição completa e otimizada...",
                  "seoTags": ["tagA", "tagB", "tagC", ...],
                  "frasesDeGancho": ${includePhrases ? '["Outra Frase 1", "Outra Frase 2", "Outra Frase 3", "Outra Frase 4", "Outra Frase 5"]' : '[]'},
                  "descricaoThumbnail": "${includePhrases ? 'Another detailed visual prompt in English with the placeholder [FRASE DE GANCHO AQUI]...' : 'Another detailed visual prompt in English WITHOUT any text or phrases, only visual elements...'}"
                }
              ]
            }
        `;
            } else { // OpenAI
                thumbPrompt = `
            Você é um especialista em YouTube, combinando as habilidades de um diretor de arte para thumbnails e um mestre de SEO.${formulaContext}

            IMAGEM DE REFERÊNCIA: [A imagem da thumbnail original do vídeo está anexada]
            TÍTULO DO VÍDEO (para contexto): "${selectedTitle}"
            SUBNICHE (Público-Alvo): "${subniche}"
            ESTILO DE ARTE DESEJADO: "${style}"
            IDIOMA DO CONTEÚDO: "${language}"

            ⚠️ ATENÇÃO CRÍTICA: As thumbnails DEVEM parecer FOTOGRAFIAS REAIS, não ilustrações, desenhos ou renderizações. A descriçãoThumbnail deve descrever uma FOTO REAL tirada por um fotógrafo profissional em um local real, com pessoas reais e objetos reais.
            
            🎯 OBJETIVO: Criar thumbnails otimizadas para CTR acima de 25% usando técnicas de Thumbnail Designer profissional:
            - TEXTO PROFISSIONAL (COMO PHOTOSHOP): O texto DEVE parecer feito no Photoshop por um designer profissional. Use múltiplos efeitos de camada (stroke, drop shadow com valores específicos, outer glow, bevel and emboss), tipografia profissional com kerning perfeito, renderização profissional com anti-aliasing. Grande, estilizado, cores vibrantes (amarelo/vermelho/branco com outline preto), efeitos visuais profissionais com valores específicos (distância, spread, tamanho, opacidade, ângulo), posicionamento estratégico (topo/centro), ocupando 25-35% da imagem. O texto DEVE ter qualidade de agência de design, não amador.
            - COMPOSIÇÃO: Regra dos terços, hierarquia visual clara, elemento principal em destaque
            - CORES: Alto contraste, cores complementares, saturação otimizada, fundo que faz o texto "pular"
            - EMOÇÃO: Expressões faciais intensas, momentos de tensão, curiosidade visual
            - ELEMENTOS VIRAIS: FOMO (medo de perder), surpresa, contraste dramático, storytelling visual
            
            SUA TAREFA (OTIMIZADA PARA VIRALIZAÇÃO - GPT):
            Analise a thumbnail VIRAL de referência e crie DUAS (2) adaptações que mantenham o PODER VIRAL original, mas adaptadas para o subnicho "${subniche}" e o título "${selectedTitle}".
            
            - **IDEIA 1 (Adaptação Estratégica Mantendo o Poder Viral):** 
              Analise PROFUNDAMENTE a thumbnail viral de referência e identifique:
              * O que tornou esta thumbnail viral? (composição, cores, elementos visuais, expressões, texto, contraste)
              * Quais elementos visuais geraram curiosidade e cliques?
              * Qual foi a estratégia emocional que funcionou?
              
              Agora, crie uma ADAPTAÇÃO para o subnicho "${subniche}" e título "${selectedTitle}" que:
              * MANTENHA os elementos virais que funcionaram (composição similar, estratégia emocional, contraste)
              * ADAPTE os elementos visuais para o seu subnicho (personagens, objetos, cenários relevantes)
              * MELHORE o que for possível (cores mais vibrantes, contraste maior, composição mais impactante)
              * MANTENHA o mesmo PODER VIRAL da original
              * APRIMORE: composição visual (regra dos terços, hierarquia visual, pontos focais), contraste de cores (cores complementares, saturação otimizada), expressões faciais ou elementos emocionais, e clareza do elemento principal
              
              O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada e valores específicos.
            
            - **IDEIA 2 (Inovação Viral com Elementos do Original):** 
              Crie um conceito COMPLETAMENTE NOVO que:
              * USE os GATILHOS VIRAIS identificados na thumbnail original (curiosidade, FOMO, surpresa, contraste)
              * ADAPTE para o subnicho "${subniche}" com elementos visuais relevantes
              * OTIMIZE para o título "${selectedTitle}" destacando palavras-chave visuais
              * SEJA AINDA MAIS IMPACTANTE que a original (cores mais vibrantes, contraste maior, composição mais dramática)
              * GERE MAIS CURIOSIDADE e CLIQUE que a original
              
              Foque em: 
              * Curiosidade extrema (elementos misteriosos, surpreendentes, inusitados)
              * Emoção intensa (expressões faciais dramáticas, momentos de tensão máxima)
              * Contraste visual máximo (cores vibrantes vs. fundo neutro, luz vs. sombra dramática)
              * FOMO máximo (medo de perder algo, urgência visual, exclusividade)
              * Composição visual avançada (regra dos terços, hierarquia visual, pontos focais estratégicos)
              
              O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada e valores específicos.

            PARA CADA UMA DAS 2 IDEIAS, GERE:
            1.  **"seoDescription"**: Uma descrição de vídeo para o YouTube, otimizada para SEO, com parágrafos bem estruturados, chamadas para ação e uso de palavras-chave relevantes para o título e subnicho. A descrição deve estar no idioma "${language}".
            2.  **"seoTags"**: Um array de strings com as 10 a 15 tags mais relevantes para o vídeo, misturando termos de cauda curta e longa.
            3.  **"frasesDeGancho"**: Um array com 5 frases CURTAS de impacto (ganchos) para a thumbnail, no idioma "${language}". ${!includePhrases ? 'IMPORTANTE: Retorne um array vazio [].' : ''}
            4.  **"descricaoThumbnail"**: Um prompt EXTREMAMENTE DETALHADO e VÍVIDO, em INGLÊS, para uma IA de geração de imagem. ${!includePhrases ? 'NÃO inclua nenhum placeholder para texto. A thumbnail deve ser APENAS imagem, sem texto ou frases de gancho. Descreva apenas elementos visuais, composição, cores, iluminação, etc.' : 'A descrição DEVE incluir um placeholder claro, como "[FRASE DE GANCHO AQUI]", onde o texto da thumbnail deve ser inserido.'}
            
            CRÍTICO PARA A "descricaoThumbnail" - DEVE SER FOTOGRAFIA REAL, NÃO ILUSTRAÇÃO:
            - OBRIGATÓRIO: A descrição DEVE começar EXATAMENTE com: "Ultra-high-definition (8K) professional photograph, captured with a world-class professional camera (Arri Alexa 65, Red Komodo, or Canon EOS R5), shot on location, real-world photography, documentary photography, photorealistic, hyper-realistic, absolutely no illustration, no drawing, no cartoon, no artwork, no digital art, no render, no 3D, no CGI, no stylized, no artistic interpretation, real photograph of real people and real objects, National Geographic documentary quality, BBC documentary style, real textures, real imperfections, real lighting, real shadows, real depth of field, real bokeh, real camera grain, real color grading, real-world photography"
            - ENFATIZE REPETIDAMENTE: "real photograph", "shot on location", "documentary photography", "realistic textures with imperfections", "natural lighting with real shadows", "real depth of field", "real bokeh effects", "professional color grading", "high dynamic range (HDR)", "sharp focus on subject", "real camera grain", "real-world photography", "actual photograph", "photographed in real life", "real person", "real object", "real environment"
            - NUNCA, JAMAIS use estes termos: "illustration", "drawing", "artwork", "digital art", "render", "3D render", "CGI", "cartoon", "anime", "sketch", "painting", "stylized", "artistic", "concept art", "digital painting", "graphic design", "vector", "comic", "fantasy art"
            - SEMPRE use APENAS estes termos: "photograph", "photo", "photography", "shot", "captured", "documentary photo", "realistic capture", "professional photography", "real-world photography", "actual photograph", "photographed", "real-life photography", "on-location photography"
            - IMPORTANTE: Descreva como se fosse uma FOTO REAL tirada por um fotógrafo profissional. Mencione detalhes realistas como: "real skin texture with pores", "real fabric texture", "real stone texture with weathering", "real shadows cast by real light sources", "real depth of field blur", "real camera lens distortion", "real chromatic aberration", "real lens flare", "real motion blur if applicable"

            REGRAS IMPORTANTES:
            - A "descricaoThumbnail" é OBRIGATORIAMENTE em INGLÊS.
            - "seoDescription", "seoTags" e "frasesDeGancho" são OBRIGATORIAMENTE no idioma "${language}".
            ${!includePhrases ? '- IMPORTANTE: A "descricaoThumbnail" NÃO deve mencionar texto, palavras ou frases. Apenas descreva elementos visuais, composição, cores, iluminação, etc.' : ''}
            - Seja extremamente específico e detalhado nas descrições visuais. Use termos técnicos de fotografia profissional, cinematografia e psicologia visual quando apropriado.
            - Foque em elementos que maximizem CTR: expressões faciais intensas, momentos de tensão, curiosidade visual, contraste dramático, composição impactante.
            
            EXEMPLOS DE COMO DESCREVER PARA GARANTIR REALISMO:
            - Em vez de "um guerreiro maia", escreva: "a real person dressed as a Mayan warrior, photographed on location, real skin texture with pores and natural imperfections, real fabric of the costume with visible texture and wrinkles, real feathers in the headdress with natural variations"
            - Em vez de "uma pirâmide antiga", escreva: "a real ancient Mayan pyramid photographed on location, real weathered stone with cracks and imperfections, real moss and vegetation growing on the stones, real shadows cast by the sun, real depth of field blur in the background"
            - Em vez de "luz mística", escreva: "real natural lighting from the sun, real shadows cast by real objects, real depth of field, real bokeh in the background, real camera lens flare if the sun is in frame"
            - SEMPRE mencione: "real", "actual", "photographed", "shot on location", "documentary style", "real-world", "actual photograph"
            
            TÉCNICAS DE THUMBNAIL VIRAL PARA O TEXTO (quando includePhrases = true) - DESIGN PROFISSIONAL COMO PHOTOSHOP - CTR ACIMA DE 25%:
            
            📝 DESCRIÇÃO OBRIGATÓRIA DO TEXTO - DEVE PARECER FEITO NO PHOTOSHOP POR UM DESIGNER PROFISSIONAL:
            O texto DEVE ser descrito como se fosse criado no Photoshop com técnicas profissionais de design gráfico:
            
            1. TIPOGRAFIA PROFISSIONAL:
               - "Professional typography, Photoshop-quality text design"
               - "Large, bold, professionally designed text occupying 25-35% of the image height"
               - "Massive, oversized typography with professional letter spacing and kerning"
               - "Thick, chunky, professionally rendered letters"
               - "Typography that looks like it was designed by a professional graphic designer"
               - "High-end text design, magazine-quality typography"
            
            2. CORES PROFISSIONAIS E EFEITOS DE CAMADA (Layer Effects do Photoshop):
               - "Bright yellow (#FFD700) text with professional Photoshop layer effects: thick black stroke (6-8px), white drop shadow with distance 8px, spread 5px, size 12px, opacity 80%, angle 135 degrees"
               - "Pure white text with professional red stroke (6px), black drop shadow with blur radius 10px, and subtle outer glow effect in yellow"
               - "Neon orange (#FF6600) text with black stroke (7px), professional drop shadow with multiple layers, and yellow outer glow with spread 8px"
               - "Electric blue (#00FFFF) text with white stroke (6px), black shadow with distance 10px, and professional bevel and emboss effect"
               - "Bright red (#FF0000) text with yellow stroke (5px), white drop shadow, and professional gradient overlay from yellow to orange"
               - "Lime green (#00FF00) text with black stroke (8px), white glow effect, and professional inner shadow"
               - IMPORTANTE: Descreva como efeitos de camada do Photoshop (layer effects), não apenas "outline" ou "shadow"
            
            3. FONTES PROFISSIONAIS:
               - "Professional bold sans-serif font (Impact, Bebas Neue, Montserrat Black, or similar premium font)"
               - "Thick, chunky, professionally designed block letters"
               - "Modern, high-end typography with perfect letter spacing"
               - "YouTube viral thumbnail professional font style"
               - "Bold, condensed font with professional kerning and tracking"
               - "Premium typography, no serifs, maximum readability, professional design"
               - "Typography that looks like it came from a professional design agency"
            
            4. EFEITOS PROFISSIONAIS DO PHOTOSHOP (Layer Styles):
               - "Professional Photoshop stroke effect: thick black outline (6-8px width), position: outside, blend mode: normal, opacity: 100%"
               - "Professional drop shadow: distance 10px, spread 5px, size 12px, angle 135°, opacity 80%, color black, blend mode: multiply"
               - "Professional outer glow effect: spread 8px, size 15px, opacity 75%, color matching text or contrasting"
               - "Professional bevel and emboss effect: style: emboss, technique: smooth, depth 100%, size 5px, softness 2px"
               - "Professional gradient overlay: linear gradient from bright color to darker shade, angle 90°, opacity 80%"
               - "Professional inner shadow: distance 3px, choke 0%, size 5px, opacity 60%"
               - "Professional color overlay: solid color with blend mode overlay or soft light, opacity 50%"
               - "Text appears to pop out from the image with professional 3D effect"
               - "Professional text rendering with anti-aliasing, crisp edges, perfect clarity"
            
            5. COMPOSIÇÃO PROFISSIONAL:
               - "Positioned at the top center of the image with professional alignment"
               - "Bottom third of the image with professional composition and high contrast background"
               - "Centered horizontally, upper third vertically, following rule of thirds"
               - "Strategically placed to not cover important visual elements, professional layout"
               - "Text area has professional semi-transparent dark background (black overlay with 40% opacity) for better readability"
               - "Professional text box or banner behind text with gradient or solid color, rounded corners optional"
            
            6. CONTRASTE E VISIBILIDADE PROFISSIONAL:
               - "High contrast against the background, professionally optimized"
               - "Text stands out dramatically from the image with professional design techniques"
               - "Eye-catching text overlay that immediately draws attention, professional composition"
               - "Text that pops from the image with maximum visibility, professional rendering"
               - "Text is the first thing the eye is drawn to, professional visual hierarchy"
               - "Background is professionally darkened (vignette effect) or lightened behind text for maximum contrast"
               - "Professional color grading applied to background to make text stand out"
            
            7. EXEMPLO COMPLETO DE DESCRIÇÃO PROFISSIONAL:
               "Professional Photoshop-quality text design: Large, bold, stylized text '[FRASE DE GANCHO AQUI]' in bright yellow (#FFD700) with professional layer effects: thick black stroke (7px width, position outside), white drop shadow (distance 10px, spread 5px, size 12px, opacity 80%, angle 135°), subtle outer glow in white (spread 6px, size 10px, opacity 70%), positioned at the top center of the image, occupying 30% of the image height, professional bold sans-serif font (Impact or Bebas Neue style), thick chunky letters with perfect kerning, professional text rendering with anti-aliasing and crisp edges, high contrast viral thumbnail text style, eye-catching and attention-grabbing, text appears to pop out from the image with professional 3D effect, maximum visibility for high CTR, looks like it was designed by a professional graphic designer in Photoshop"
            
            8. REGRAS DE OURO PARA DESIGN PROFISSIONAL:
               - O texto DEVE parecer feito no Photoshop por um designer profissional
               - O texto DEVE ter múltiplos efeitos de camada (stroke, shadow, glow, bevel)
               - O texto DEVE ter valores específicos de efeitos (distância, spread, tamanho, opacidade)
               - O texto DEVE ter tipografia profissional com kerning e tracking perfeitos
               - O texto DEVE ter renderização profissional (anti-aliasing, crisp edges)
               - O texto DEVE ter composição profissional (regra dos terços, hierarquia visual)
               - O texto DEVE parecer de qualidade de agência de design, não amador

            RESPONDA APENAS COM UM OBJETO JSON VÁLIDO, com a seguinte estrutura:
            {
              "ideias": [
                {
                  "seoDescription": "Descrição completa e otimizada para o YouTube aqui...",
                  "seoTags": ["tag1", "tag2", "tag3", ...],
                  "frasesDeGancho": ${includePhrases ? '["Frase 1", "Frase 2", "Frase 3", "Frase 4", "Frase 5"]' : '[]'},
                  "descricaoThumbnail": "${includePhrases ? 'A detailed visual prompt in English with the placeholder [FRASE DE GANCHO AQUI]...' : 'A detailed visual prompt in English WITHOUT any text or phrases, only visual elements...'}"
                },
                {
                  "seoDescription": "Outra descrição completa e otimizada...",
                  "seoTags": ["tagA", "tagB", "tagC", ...],
                  "frasesDeGancho": ${includePhrases ? '["Outra Frase 1", "Outra Frase 2", "Outra Frase 3", "Outra Frase 4", "Outra Frase 5"]' : '[]'},
                  "descricaoThumbnail": "${includePhrases ? 'Another detailed visual prompt in English with the placeholder [FRASE DE GANCHO AQUI]...' : 'Another detailed visual prompt in English WITHOUT any text or phrases, only visual elements...'}"
                }
              ]
            }
        `;
            }
        }
        
        // --- 4. Chamar a API Multimodal com fallback ---
        let apiCallFunction;
        if (service === 'gemini') apiCallFunction = callGeminiAPI;
        else if (service === 'claude') apiCallFunction = callClaudeAPI;
        else if (service === 'openai') apiCallFunction = callOpenAIAPI;
        
        console.log(`[Análise-Thumb] A chamar ${service} com o modelo ${model}...`);
        
        let response;
        let parsedData;
        let successfulService = service;
        
        try {
            response = await apiCallFunction(thumbPrompt, decryptedKey, model, videoDetails.thumbnailUrl);
            parsedData = parseAIResponse(response.titles, service);
            
            if (!parsedData.ideias || !Array.isArray(parsedData.ideias) || parsedData.ideias.length === 0) {
                throw new Error("A IA não retornou o array 'ideias' esperado.");
            }
        } catch (firstError) {
            console.warn(`[Análise-Thumb] Falha com ${service}:`, firstError.message);
            
            // Tentar fallback para outros modelos se o primeiro falhar
            const fallbackServices = service === 'gemini' 
                ? ['claude', 'openai'] 
                : service === 'claude' 
                    ? ['openai', 'gemini'] 
                    : ['gemini', 'claude'];
            
            let fallbackSuccess = false;
            
            for (const fallbackService of fallbackServices) {
                try {
                    console.log(`[Análise-Thumb] Tentando fallback com ${fallbackService}...`);
                    
                    const fallbackKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, fallbackService]);
                    if (!fallbackKeyData) {
                        console.warn(`[Análise-Thumb] Chave de API do ${fallbackService} não configurada para fallback.`);
                        continue;
                    }
                    
                    const fallbackDecryptedKey = decrypt(fallbackKeyData.api_key);
                    if (!fallbackDecryptedKey) {
                        console.warn(`[Análise-Thumb] Falha ao desencriptar chave do ${fallbackService}.`);
                        continue;
                    }
                    
                    let fallbackModel = model;
                    if (fallbackService === 'claude') fallbackModel = 'claude-3-5-haiku-20241022';
                    else if (fallbackService === 'openai') fallbackModel = 'gpt-4o';
                    else if (fallbackService === 'gemini') fallbackModel = 'gemini-2.0-flash';
                    
                    let fallbackApiCallFunction;
                    if (fallbackService === 'gemini') fallbackApiCallFunction = callGeminiAPI;
                    else if (fallbackService === 'claude') fallbackApiCallFunction = callClaudeAPI;
                    else fallbackApiCallFunction = callOpenAIAPI;
                    
                    response = await fallbackApiCallFunction(thumbPrompt, fallbackDecryptedKey, fallbackModel, videoDetails.thumbnailUrl);
                    parsedData = parseAIResponse(response.titles, fallbackService);
                    
                    if (!parsedData.ideias || !Array.isArray(parsedData.ideias) || parsedData.ideias.length === 0) {
                        throw new Error("A IA não retornou o array 'ideias' esperado.");
                    }
                    
                    successfulService = fallbackService;
                    fallbackSuccess = true;
                    console.log(`[Análise-Thumb] Sucesso com fallback ${fallbackService}!`);
                    break;
                } catch (fallbackError) {
                    console.warn(`[Análise-Thumb] Fallback ${fallbackService} também falhou:`, fallbackError.message);
                    continue;
                }
            }
            
            if (!fallbackSuccess) {
                throw new Error(`Todas as IAs falharam. Último erro: ${firstError.message}`);
            }
        }

        // --- 5. Enviar resposta ---

        // NÃO salvar thumbnails automaticamente - apenas quando o usuário gerar a imagem e salvar na biblioteca
        // As thumbnails serão salvas apenas quando o usuário gerar a imagem com ImageFX e clicar em "Salvar na Biblioteca"
        console.log(`[Biblioteca] ${parsedData.ideias.length} ideias de thumbnails geradas. Aguardando geração de imagem pelo usuário para salvar na biblioteca.`);

        res.status(200).json(parsedData.ideias);

    } catch (err) {
        console.error('[ERRO NA ROTA /api/analyze/thumbnail]:', err);
        res.status(500).json({ msg: err.message || 'Erro interno do servidor ao gerar ideias de thumbnail.' });
    }
});


// === ROTA PARA GERAR IMAGEM COM IMAGEFX ===
app.post('/api/generate/imagefx', authenticateToken, async (req, res) => {
    const { prompt, niche, subniche, style, saveToLibrary } = req.body;
    const userId = req.user.id;

    if (!prompt) {
        return res.status(400).json({ msg: 'Um prompt (descrição da thumbnail) é obrigatório.' });
    }

    try {
        const keyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, 'imagefx']);
        if (!keyData) {
            return res.status(400).json({ msg: 'Cookies do ImageFX não configurados. Salve-os nas Configurações.' });
        }
        
        const decryptedCookies = decrypt(keyData.api_key);
        if (!decryptedCookies) {
            return res.status(500).json({ msg: 'Falha ao desencriptar os seus cookies.' });
        }
        
        console.log('[ImageFX] A iniciar geração...');
        const imageFx = new ImageFX(decryptedCookies);
        let currentPrompt = `${prompt}, photorealistic, hyperrealistic, cinematic, 8k, ultra high definition, sharp focus, professional photography, taken with a high-end camera like a Sony α7 IV, detailed skin texture, natural lighting`;
        
        const maxRetries = 5;
        let attempt = 0;
        let images = null;
        let lastError = null;
        
        // Função para detectar se o erro é de política de conteúdo
        const isPolicyError = (error) => {
            if (!error || !error.message) return false;
            const errorStr = error.message.toLowerCase();
            const errorCode = error.code;
            
            // Verificar códigos de erro de política (400 Bad Request com códigos específicos)
            if (errorCode === 400) {
                // Verificar na mensagem de erro
                const hasPolicyIndicator = (
                    errorStr.includes('public_error') ||
                    errorStr.includes('prominent_people') ||
                    errorStr.includes('filter_failed') ||
                    errorStr.includes('invalid_argument') ||
                    errorStr.includes('policy') ||
                    errorStr.includes('prohibited') ||
                    errorStr.includes('content policy') ||
                    errorStr.includes('public_error_prominent_people_filter_failed')
                );
                
                // Verificar também nos detalhes do erro se existirem
                if (error.rawError) {
                    try {
                        const errorJson = JSON.parse(error.rawError);
                        if (errorJson.error) {
                            const errorDetails = errorJson.error;
                            if (errorDetails.details) {
                                for (const detail of errorDetails.details) {
                                    if (detail.reason && (
                                        detail.reason.includes('PUBLIC_ERROR') ||
                                        detail.reason.includes('PROMINENT_PEOPLE') ||
                                        detail.reason.includes('FILTER_FAILED')
                                    )) {
                                        return true;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Ignorar erros de parsing
                    }
                }
                
                return hasPolicyIndicator;
            }
            
            return false;
        };
        
        // Função para reformular o prompt usando IA
        const reformulatePrompt = async (originalPrompt, errorMessage) => {
            try {
                // Tentar usar Gemini primeiro (mais rápido), depois Claude, depois OpenAI
                const services = ['gemini', 'claude', 'openai'];
                let reformulatedPrompt = null;
                
                for (const service of services) {
                    try {
                        const serviceKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, service]);
                        if (!serviceKeyData) continue;
                        
                        const decryptedKey = decrypt(serviceKeyData.api_key);
                        if (!decryptedKey) continue;
                        
                        let apiCallFunction;
                        let model;
                        if (service === 'gemini') {
                            apiCallFunction = callGeminiAPI;
                            model = 'gemini-2.0-flash';
                        } else if (service === 'claude') {
                            apiCallFunction = callClaudeAPI;
                            model = 'claude-3-5-haiku-20241022';
                        } else {
                            apiCallFunction = callOpenAIAPI;
                            model = 'gpt-4o-mini';
                        }
                        
                        const reformulationPrompt = `Você é um especialista em criar prompts para geração de imagens que respeitam políticas de conteúdo.

O prompt original foi rejeitado pelo gerador de imagens com o seguinte erro:
"${errorMessage}"
PROMPT ORIGINAL (que foi rejeitado):
"${originalPrompt}"

Sua tarefa é criar uma NOVA versão do prompt que:
1. Mantenha a essência visual e o conceito do prompt original
2. Remova ou substitua quaisquer elementos que possam violar políticas de conteúdo (como pessoas reais, conteúdo sensível, etc.)
3. Use descrições genéricas em vez de específicas (ex: "pessoa" em vez de "pessoa específica", "figura histórica genérica" em vez de nomes reais)
4. Foque em elementos visuais, composição, cores, atmosfera, objetos, cenários
5. Mantenha o estilo profissional, fotográfico e cinematográfico
6. Garanta que o prompt seja adequado para criar thumbnails virais do YouTube

IMPORTANTE:
- NÃO mencione pessoas reais, celebridades, figuras históricas específicas
- Use descrições genéricas de pessoas: "uma pessoa", "figura humana", "personagem genérico"
- Foque em elementos visuais: objetos, cenários, composição, cores, iluminação, atmosfera
- Mantenha elementos que geram curiosidade e alto CTR (contraste, cores vibrantes, composição impactante)
- O prompt deve ser em inglês e descrever uma imagem fotográfica realista

Responda APENAS com o prompt reformulado, sem explicações adicionais.`;

                        const response = await apiCallFunction(reformulationPrompt, decryptedKey, model);
                        
                        // Todas as APIs retornam o texto em response.titles
                        let extractedText = response.titles || response.text || '';
                        
                        // Limpar o texto extraído (remover markdown, código, explicações, etc.)
                        reformulatedPrompt = extractedText
                            .replace(/```[\s\S]*?```/g, '') // Remover blocos de código
                            .replace(/`/g, '') // Remover backticks
                            .replace(/^[^"]*["']|["'][^"]*$/g, '') // Remover aspas no início/fim
                            .replace(/^(Prompt|Prompt reformulado|Nova versão|Versão reformulada)[:：]\s*/i, '') // Remover prefixos comuns
                            .replace(/\n+/g, ' ') // Substituir quebras de linha por espaços
                            .replace(/\s+/g, ' ') // Normalizar espaços
                            .trim();
                        
                        // Garantir que o prompt tenha conteúdo válido
                        if (reformulatedPrompt && reformulatedPrompt.length > 50 && reformulatedPrompt.length < 2000) {
                            console.log(`[ImageFX] Prompt reformulado usando ${service} (${reformulatedPrompt.length} caracteres)`);
                            // Adicionar os sufixos de qualidade de volta se não estiverem presentes
                            if (!reformulatedPrompt.includes('photorealistic')) {
                                reformulatedPrompt += ', photorealistic, hyperrealistic, cinematic, 8k, ultra high definition, sharp focus, professional photography';
                            }
                            break;
                        } else {
                            console.warn(`[ImageFX] Prompt reformulado muito curto ou muito longo (${reformulatedPrompt?.length || 0} caracteres). Tentando próximo serviço...`);
                        }
                    } catch (serviceErr) {
                        console.warn(`[ImageFX] Falha ao reformular com ${service}:`, serviceErr.message);
                        continue;
                    }
                }
                
                if (!reformulatedPrompt) {
                    // Fallback: remover manualmente elementos problemáticos comuns
                    console.log('[ImageFX] Usando fallback para reformular prompt');
                    reformulatedPrompt = originalPrompt
                        .replace(/real person|actual person|specific person|celebrity|famous person/gi, 'generic person')
                        .replace(/historical figure|famous figure|known person/gi, 'generic historical character')
                        .replace(/named person|person named/gi, 'person')
                        .replace(/real people|actual people/gi, 'people')
                        + ', generic characters, no specific individuals, artistic representation';
                }
                
                return reformulatedPrompt;
            } catch (err) {
                console.error('[ImageFX] Erro ao reformular prompt:', err);
                // Fallback simples
                return originalPrompt
                    .replace(/real person|actual person|specific person/gi, 'generic person')
                    .replace(/celebrity|famous person/gi, 'person')
                    + ', generic characters, artistic representation';
            }
        };
        
        // Loop de tentativas com reformulação automática
        while (attempt < maxRetries && !images) {
            attempt++;
            try {
                console.log(`[ImageFX] Tentativa ${attempt}/${maxRetries} com prompt: ${currentPrompt.substring(0, 100)}...`);
                
                images = await imageFx.generateImage(currentPrompt, {
                    numberOfImages: 1,
                    aspectRatio: AspectRatio.LANDSCAPE 
                });

                if (images && images.length > 0) {
                    console.log(`[ImageFX] Imagem gerada com sucesso na tentativa ${attempt}`);
                    break;
                }
            } catch (err) {
                lastError = err;
                console.warn(`[ImageFX] Erro na tentativa ${attempt}:`, err.message);
                
                // Verificar se é erro de política de conteúdo
                if (isPolicyError(err) && attempt < maxRetries) {
                    console.log(`[ImageFX] Erro de política detectado. Reformulando prompt...`);
                    currentPrompt = await reformulatePrompt(currentPrompt, err.message);
                    // Adicionar um pequeno delay antes de tentar novamente
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                } else {
                    // Se não for erro de política ou atingiu max retries, lançar o erro
                    throw err;
                }
            }
        }

        if (!images || images.length === 0) {
            throw new Error(lastError?.message || 'O ImageFX não retornou imagens após múltiplas tentativas.');
        }

        const imageUrl = images[0].getImageData().url;

        // Salvar automaticamente na biblioteca se solicitado
        let savedId = null;
        if (saveToLibrary && imageUrl) {
            try {
                const result = await db.run(
                    `INSERT INTO viral_thumbnails_library (user_id, thumbnail_url, thumbnail_description, niche, subniche, style, viral_score)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [userId, imageUrl, prompt, niche || null, subniche || null, style || null, 8]
                );
                savedId = result.lastID;
                console.log(`[ImageFX] Thumbnail salva na biblioteca com ID ${savedId}`);
            } catch (libErr) {
                console.warn('[ImageFX] Erro ao salvar thumbnail na biblioteca:', libErr.message);
            }
        }

        res.status(200).json({ 
            msg: 'Imagem gerada com sucesso!',
            imageUrl: imageUrl,
            savedToLibrary: savedId !== null,
            libraryId: savedId,
            attempts: attempt
        });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/generate/imagefx]:', err);
        
        // Verificar se é erro do ImageFX com código específico
        if (err.code === 400 && err.message) {
            const errorMsg = err.message;
            if (errorMsg.includes('PUBLIC_ERROR') || errorMsg.includes('filter_failed')) {
                return res.status(500).json({ 
                    msg: 'Não foi possível gerar a imagem após múltiplas tentativas de reformulação. O conteúdo pode violar políticas do gerador de imagens. Tente modificar o prompt manualmente para remover referências a pessoas reais ou conteúdo sensível.',
                    error: errorMsg
                });
            }
        }
        
        res.status(500).json({ msg: err.message || 'Erro interno do servidor ao gerar imagem.' });
    }
});

// === FUNÇÕES DE TRANSCRIÇÃO COM WHISPER ===

/**
 * Baixa o áudio usando yt-dlp (método mais estável - ignora bugs do ytdl-core)
 */
async function downloadAudioWithYtDlp(videoId) {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const audioPath = path.join(TEMP_DIR, `${videoId}_${Date.now()}.mp3`);
    
    console.log(`[Whisper] ⏳ Baixando áudio com yt-dlp (método estável): ${videoId}`);
    
    try {
        // Verificar se yt-dlp está disponível
        try {
            await execAsync('yt-dlp --version');
        } catch (versionErr) {
            throw new Error('yt-dlp não está instalado. Instale com: pip install -U yt-dlp ou baixe de https://github.com/yt-dlp/yt-dlp/releases/latest');
        }
        
        // Baixar e converter para MP3 usando yt-dlp
        // -x: extrair áudio
        // --audio-format mp3: formato MP3
        // -o: nome do arquivo de saída
        const command = `yt-dlp -x --audio-format mp3 -o "${audioPath.replace('.mp3', '.%(ext)s')}" "${videoUrl}"`;
        
        console.log(`[Whisper] Executando: yt-dlp...`);
        const { stdout, stderr } = await execAsync(command, {
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });
        
        if (stderr && !stderr.includes('WARNING')) {
            console.warn(`[Whisper] Avisos do yt-dlp:`, stderr);
        }
        
        // Verificar se o arquivo foi criado
        if (!fs.existsSync(audioPath)) {
            // yt-dlp pode criar com extensão diferente, procurar arquivo
            const files = fs.readdirSync(TEMP_DIR);
            const audioFile = files.find(f => f.startsWith(videoId) && (f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.webm')));
            if (audioFile) {
                const foundPath = path.join(TEMP_DIR, audioFile);
                // Se não for MP3, converter
                if (!audioFile.endsWith('.mp3')) {
                    const mp3Path = audioPath;
                    await new Promise((resolve, reject) => {
                        ffmpeg(foundPath)
                            .audioCodec('libmp3lame')
                            .format('mp3')
                            .on('end', () => {
                                fs.unlinkSync(foundPath); // Remover arquivo original
                                resolve();
                            })
                            .on('error', reject)
                            .save(mp3Path);
                    });
                }
                console.log(`[Whisper] ✅ Áudio baixado com yt-dlp: ${audioPath}`);
                return audioPath;
            }
            throw new Error('Arquivo de áudio não foi criado pelo yt-dlp');
        }
        
        console.log(`[Whisper] ✅ Áudio baixado com yt-dlp: ${audioPath}`);
        return audioPath;
    } catch (err) {
        console.error(`[Whisper] ❌ Erro ao baixar com yt-dlp:`, err.message);
        throw err;
    }
}

/**
 * Baixa o áudio de um vídeo do YouTube e extrai para arquivo MP3
 * Tenta primeiro com ytdl-core, depois com yt-dlp como fallback (100% estável)
 */
async function downloadAndExtractAudio(videoId) {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const audioPath = path.join(TEMP_DIR, `${videoId}_${Date.now()}.mp3`);
    
    console.log(`[Whisper] ⏳ Baixando áudio do vídeo: ${videoId}`);
    
    // Tentar primeiro com ytdl-core
    try {
        return await new Promise((resolve, reject) => {
            try {
                // Baixar stream de áudio do YouTube
                // dlChunkSize: 0 evita o bug de segmentação de stream
                // highWaterMark: 1 << 25 evita travamento (33MB buffer)
                const stream = ytdl(videoUrl, {
                    quality: 'highestaudio',
                    filter: 'audioonly',
                    dlChunkSize: 0, // Corrige bug de segmentação
                    highWaterMark: 1 << 25 // 33MB buffer - evita travamento
                });
                
                // Verificar se o stream tem dados válidos
                let hasData = false;
                stream.on('data', (chunk) => {
                    hasData = true;
                });
                
                // Timeout para detectar se não há dados chegando
                const dataTimeout = setTimeout(() => {
                    if (!hasData) {
                        stream.destroy();
                        // Tentar yt-dlp quando stream vazio
                        console.log(`[Whisper] Stream vazio detectado, tentando yt-dlp...`);
                        downloadAudioWithYtDlp(videoId)
                            .then(resolve)
                            .catch((ytdlpErr) => {
                                reject(new Error(`Stream vazio e yt-dlp não disponível. Instale yt-dlp: pip install -U yt-dlp`));
                            });
                    }
                }, 5000); // 5 segundos para detectar falta de dados
                
                // Converter para MP3 usando FFmpeg (método simplificado do tutorial)
                const ffmpegProcess = ffmpeg(stream)
                    .audioCodec('libmp3lame')
                    .noVideo() // Garantir que só processa áudio
                    .on('start', (commandLine) => {
                        console.log(`[Whisper] FFmpeg iniciado...`);
                    })
                    .on('progress', (progress) => {
                        if (progress.percent) {
                            console.log(`[Whisper] Progresso: ${Math.round(progress.percent)}%`);
                        }
                    })
                    .on('end', () => {
                        clearTimeout(dataTimeout);
                        console.log(`[Whisper] ✅ Áudio extraído com sucesso: ${audioPath}`);
                        resolve(audioPath);
                    })
                    .on('error', (err) => {
                        clearTimeout(dataTimeout);
                        console.error(`[Whisper] ❌ Erro no FFmpeg:`, err.message);
                        
                        // Verificar se é erro relacionado a stream vazio - tentar yt-dlp
                        if (err.message && (
                            err.message.includes('Input stream error') ||
                            err.message.includes('pipe') ||
                            err.message.includes('EPIPE')
                        )) {
                            console.log(`[Whisper] FFmpeg falhou por stream vazio, tentando yt-dlp...`);
                            downloadAudioWithYtDlp(videoId)
                                .then(resolve)
                                .catch((ytdlpErr) => {
                                    reject(new Error(`FFmpeg falhou e yt-dlp não disponível. Instale yt-dlp: pip install -U yt-dlp`));
                                });
                        } else {
                            reject(new Error(`Erro ao processar áudio: ${err.message}`));
                        }
                    })
                    .save(audioPath);
                
                // Tratar erros do stream do YouTube
                stream.on('error', (streamErr) => {
                    clearTimeout(dataTimeout);
                    console.error(`[Whisper] ❌ Erro no stream do YouTube:`, streamErr.message);
                    
                    // Verificar se é o erro conhecido de parsing - tentar yt-dlp como fallback
                    if (streamErr.message && (
                        streamErr.message.includes('Could not parse') ||
                        streamErr.message.includes('decipher function') ||
                        streamErr.message.includes('Stream URLs will be missing')
                    )) {
                        console.log(`[Whisper] ytdl-core falhou, tentando yt-dlp (método 100% estável)...`);
                        // Tentar com yt-dlp
                        downloadAudioWithYtDlp(videoId)
                            .then(resolve)
                            .catch((ytdlpErr) => {
                                console.error(`[Whisper] yt-dlp também falhou:`, ytdlpErr.message);
                                reject(new Error(`Não foi possível baixar o áudio. ytdl-core falhou e yt-dlp não está instalado ou também falhou. Instale yt-dlp: pip install -U yt-dlp`));
                            });
                    } else {
                        reject(new Error(`Erro ao baixar áudio do YouTube: ${streamErr.message}`));
                    }
                });
                
                // Limpar timeout quando stream terminar
                stream.on('end', () => {
                    clearTimeout(dataTimeout);
                });
                
            } catch (err) {
                console.error(`[Whisper] ❌ Erro ao iniciar download com ytdl-core:`, err.message);
                
                // Verificar se é o erro conhecido de parsing - tentar yt-dlp como fallback
                if (err.message && (
                    err.message.includes('Could not parse') ||
                    err.message.includes('decipher function') ||
                    err.message.includes('Stream URLs will be missing')
                )) {
                    console.log(`[Whisper] ytdl-core falhou, tentando yt-dlp (método 100% estável)...`);
                    // Tentar com yt-dlp
                    downloadAudioWithYtDlp(videoId)
                        .then(resolve)
                        .catch((ytdlpErr) => {
                            console.error(`[Whisper] yt-dlp também falhou:`, ytdlpErr.message);
                            reject(new Error(`Não foi possível baixar o áudio. ytdl-core falhou e yt-dlp não está instalado ou também falhou. Instale yt-dlp: pip install -U yt-dlp`));
                        });
                } else {
                    reject(err);
                }
            }
        });
    } catch (err) {
        // Se ytdl-core falhar completamente, tentar yt-dlp
        console.log(`[Whisper] ytdl-core falhou completamente, tentando yt-dlp (método 100% estável)...`);
        try {
            return await downloadAudioWithYtDlp(videoId);
        } catch (ytdlpErr) {
            throw new Error(`Ambos os métodos falharam. ytdl-core: ${err.message.substring(0, 50)}. yt-dlp: ${ytdlpErr.message.substring(0, 50)}. Instale yt-dlp para maior estabilidade: pip install -U yt-dlp`);
        }
    }
}

/**
 * Transcreve áudio usando OpenAI Whisper
 */
async function transcribeWithWhisper(audioPath, userId) {
    try {
        // Buscar chave da OpenAI
        const openaiKeyData = await db.get(
            'SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?',
            [userId, 'openai']
        );
        
        if (!openaiKeyData) {
            throw new Error('Chave de API da OpenAI não configurada. Configure sua chave OpenAI nas configurações.');
        }
        
        const openaiApiKey = decrypt(openaiKeyData.api_key);
        if (!openaiApiKey) {
            throw new Error('Falha ao desencriptar a chave de API da OpenAI.');
        }
        
        // Inicializar cliente OpenAI
        const openai = new OpenAI({
            apiKey: openaiApiKey
        });
        
        console.log(`[Whisper] 🧠 Enviando para transcrição (Whisper)...`);
        
        // Transcrever usando Whisper (método simplificado do tutorial)
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: 'whisper-1', // Modelo correto do Whisper
            language: 'pt' // Português por padrão
        });
        
        // A resposta do Whisper pode ser texto direto ou objeto com .text
        const transcriptText = typeof transcription === 'string' ? transcription : transcription.text || transcription;
        
        console.log(`[Whisper] ✅ Transcrição concluída! Tamanho: ${transcriptText.length} caracteres`);
        
        // Limpar arquivo temporário
        try {
            fs.unlinkSync(audioPath);
            console.log(`[Whisper] Arquivo temporário removido: ${audioPath}`);
        } catch (cleanupErr) {
            console.warn(`[Whisper] Aviso: Não foi possível remover arquivo temporário:`, cleanupErr.message);
        }
        
        return transcriptText;
    } catch (err) {
        // Limpar arquivo temporário em caso de erro
        try {
            if (fs.existsSync(audioPath)) {
                fs.unlinkSync(audioPath);
            }
        } catch (cleanupErr) {
            console.warn(`[Whisper] Erro ao limpar arquivo:`, cleanupErr.message);
        }
        throw err;
    }
}

/**
 * Função principal para transcrever vídeo usando Whisper (fallback universal)
 */
async function transcribeVideoWithWhisper(videoId, userId) {
    let audioPath = null;
    try {
        // 1. Baixar e extrair áudio
        audioPath = await downloadAndExtractAudio(videoId);
        
        // 2. Transcrever com Whisper
        const transcript = await transcribeWithWhisper(audioPath, userId);
        
        return transcript;
    } catch (err) {
        // Garantir limpeza do arquivo em caso de erro
        if (audioPath && fs.existsSync(audioPath)) {
            try {
                fs.unlinkSync(audioPath);
            } catch (cleanupErr) {
                console.warn(`[Whisper] Erro ao limpar arquivo após erro:`, cleanupErr.message);
            }
        }
        throw err;
    }
}

/**
 * Busca transcrição usando youtube-transcript (GRATUITO, busca legendas diretamente do YouTube)
 * Este é o método mais rápido e confiável quando o vídeo tem legendas
 */
async function getTranscriptFromYouTubeTranscript(videoId) {
    try {
        console.log(`[YouTube-Transcript] 🔍 Buscando transcrição via youtube-transcript para: ${videoId}`);
        
        const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);
        
        if (!transcriptData || transcriptData.length === 0) {
            throw new Error('Nenhuma transcrição encontrada');
        }
        
        // Juntar todos os textos
        const transcriptText = transcriptData.map(item => item.text).join(' ').trim();
        
        if (!transcriptText || transcriptText.length === 0) {
            throw new Error('Transcrição vazia');
        }
        
        console.log(`[YouTube-Transcript] ✅ Transcrição obtida! (${transcriptText.length} caracteres, ${transcriptData.length} segmentos)`);
        return transcriptText;
    } catch (err) {
        console.warn(`[YouTube-Transcript] ⚠️ Falha:`, err.message);
        throw err;
    }
}
/**
 * Busca transcrição usando múltiplos métodos com fallback automático
 * Ordem de prioridade:
 * 1. youtube-transcript (gratuito, mais rápido)
 * 2. Whisper Local (open-source, se instalado)
 */
async function getTranscriptWithFallback(videoUrl, userId, videoTitle = null) {
    const videoId = videoUrl.includes('youtu.be') 
        ? videoUrl.split('youtu.be/')[1]?.split('?')[0]
        : new URL(videoUrl).searchParams.get('v') || videoUrl;
    
    console.log(`[Transcrição] 🎯 Iniciando busca de transcrição com múltiplos métodos para: ${videoId}`);
    
    // MÉTODO 1: youtube-transcript (GRATUITO, mais rápido)
    try {
        console.log(`[Transcrição] Tentando método 1: youtube-transcript (gratuito)...`);
        const transcript = await getTranscriptFromYouTubeTranscript(videoId);
        console.log(`[Transcrição] ✅✅✅ SUCESSO com youtube-transcript!`);
        return { transcript, source: 'youtube-transcript' };
    } catch (youtubeTranscriptErr) {
        console.warn(`[Transcrição] Método 1 falhou:`, youtubeTranscriptErr.message);
    }
    
    // MÉTODO 2: Whisper Local (open-source, se instalado)
    try {
        console.log(`[Transcrição] Tentando método 2: Whisper Local (open-source)...`);
        
        // Verificar se Whisper está instalado usando método confiável
        if (!checkWhisperInstalled()) {
            console.warn('[Transcrição] ❌ Whisper não encontrado — pulando método local');
            throw new Error('Whisper não está instalado. Instale com: pip install git+https://github.com/openai/whisper.git');
        }
        
        console.log(`[Transcrição] ✅ Whisper detectado e disponível`);
        
        // Para Whisper, usar yt-dlp diretamente (mais confiável que ytdl-core)
        // ytdl-core está tendo problemas com YouTube, então vamos direto para yt-dlp
        console.log(`[Transcrição] Baixando áudio com yt-dlp (método mais confiável)...`);
        let audioPath;
        try {
            audioPath = await downloadAudioWithYtDlp(videoId);
        } catch (ytdlpErr) {
            // Se yt-dlp falhar, tentar com ytdl-core como último recurso
            console.log(`[Transcrição] yt-dlp falhou, tentando ytdl-core como fallback...`);
            audioPath = await downloadAndExtractAudio(videoId);
        }
        
        const transcript = await transcribeWithWhisperLocal(audioPath);
        console.log(`[Transcrição] ✅✅✅ SUCESSO com Whisper Local!`);
        return { transcript, source: 'whisper-local' };
    } catch (whisperErr) {
        console.warn(`[Transcrição] Método 2 falhou:`, whisperErr.message);
    }
    
    // Se todos os métodos falharam
    throw new Error('Todos os métodos de transcrição falharam. Verifique se o vídeo possui legendas habilitadas no YouTube ou instale o Whisper local para transcrição de áudio.');
}


/**
 * Verifica se o Whisper está instalado corretamente
 * @returns {boolean} true se Whisper está disponível, false caso contrário
 */
function checkWhisperInstalled() {
    try {
        const output = execSync('python -c "import whisper; print(\'OK\')"', {
            encoding: 'utf8',
            timeout: 5000,
            stdio: ['ignore', 'pipe', 'pipe']
        }).toString().trim();
        return output === 'OK';
    } catch (err) {
        return false;
    }
}

// Função para detectar idioma do título baseado em padrões comuns
function detectLanguageFromTitle(title) {
    if (!title || typeof title !== 'string') return null;
    
    const titleLower = title.toLowerCase();
    
    // Padrões para espanhol
    const spanishPatterns = [
        /\b(el|la|los|las|un|una|de|del|en|con|por|para|que|es|son|está|están|se|su|sus|más|muy|también|como|cuando|donde|porque|este|esta|estos|estas)\b/i,
        /[áéíóúñü]/i
    ];
    
    // Padrões para português
    const portuguesePatterns = [
        /\b(o|a|os|as|um|uma|de|do|da|dos|das|em|com|por|para|que|é|são|está|estão|se|seu|sua|seus|suas|mais|muito|também|como|quando|onde|porque|este|esta|estes|estas)\b/i,
        /[áéíóúâêôãõç]/i
    ];
    
    // Padrões para inglês
    const englishPatterns = [
        /\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by|from|as|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|should|could|may|might|this|that|these|those|what|which|who|when|where|why|how)\b/i
    ];
    
    // Contar ocorrências de cada idioma
    let spanishScore = 0;
    let portugueseScore = 0;
    let englishScore = 0;
    
    spanishPatterns.forEach(pattern => {
        if (pattern.test(title)) spanishScore++;
    });
    
    portuguesePatterns.forEach(pattern => {
        if (pattern.test(title)) portugueseScore++;
    });
    
    englishPatterns.forEach(pattern => {
        if (pattern.test(title)) englishScore++;
    });
    
    // Retornar o idioma com maior score
    if (spanishScore > portugueseScore && spanishScore > englishScore) {
        return 'es';
    } else if (portugueseScore > englishScore) {
        return 'pt';
    } else if (englishScore > 0) {
        return 'en';
    }
    
    // Se não detectar, retornar null (usará fallback)
    return null;
}


/**
 * Transcreve áudio usando Whisper LOCAL (open-source oficial da OpenAI)
 * Requer: pip install -U openai-whisper
 * Documentação: https://github.com/openai/whisper
 * Aceita MP3, WAV, M4A e outros formatos suportados pelo Whisper
 * 
 * Modelos disponíveis:
 * - tiny: ~39M parâmetros, ~1GB VRAM, ~10x mais rápido
 * - base: ~74M parâmetros, ~1GB VRAM, ~7x mais rápido (recomendado)
 * - small: ~244M parâmetros, ~2GB VRAM, ~4x mais rápido
 * - medium: ~769M parâmetros, ~5GB VRAM, ~2x mais rápido
 * - large: ~1550M parâmetros, ~10GB VRAM, 1x (mais preciso)
 * - turbo: ~809M parâmetros, ~6GB VRAM, ~8x mais rápido (otimizado)
 */
async function transcribeWithWhisperLocal(audioPath) {
    try {
        console.log(`[Whisper Local] 🧠 Transcrevendo com Whisper local (open-source oficial da OpenAI)...`);
        
        // Verificar se arquivo existe
        if (!fs.existsSync(audioPath)) {
            throw new Error(`Arquivo de áudio não encontrado: ${audioPath}`);
        }
        
        // Preparar caminho do arquivo de saída
        const outputDir = path.dirname(audioPath);
        const audioName = path.basename(audioPath, path.extname(audioPath));
        const transcriptFile = path.join(outputDir, `${audioName}.txt`);
        
        // Executar Whisper local usando o modelo oficial da OpenAI
        // --model base: modelo base (equilíbrio entre velocidade e qualidade)
        // Sem --language: Whisper detecta automaticamente o idioma (comportamento padrão)
        // --output_format txt: formato texto simples
        // --output_dir: diretório de saída
        // Whisper aceita MP3, WAV, M4A, FLAC, etc automaticamente
        // Usar 'python -m whisper' para garantir que funcione mesmo se não estiver no PATH
        let command = `python -m whisper "${audioPath}" --model base --output_format txt --output_dir "${outputDir}"`;
        
        console.log(`[Whisper Local] Executando: python -m whisper "${path.basename(audioPath)}" com modelo base (detecção automática de idioma)...`);
        
        try {
            execSync(command, { 
                stdio: 'inherit',
                timeout: 600000 // 10 minutos de timeout
            });
        } catch (pythonErr) {
            console.error(`[Whisper Local] Erro ao executar Whisper:`, pythonErr.message);
            throw new Error(`Falha ao transcrever com Whisper: ${pythonErr.message}`);
        }
        
        // Ler arquivo de transcrição gerado
        if (!fs.existsSync(transcriptFile)) {
            throw new Error('Arquivo de transcrição não foi gerado pelo Whisper');
        }
        
        const transcriptText = fs.readFileSync(transcriptFile, 'utf8').trim();
        
        if (!transcriptText || transcriptText.length === 0) {
            throw new Error('Transcrição vazia - o áudio pode estar sem fala ou muito baixo');
        }
        
        console.log(`[Whisper Local] ✅ Transcrição concluída! Tamanho: ${transcriptText.length} caracteres`);
        
        // Limpar arquivos temporários
        try {
            fs.unlinkSync(audioPath);
            fs.unlinkSync(transcriptFile);
            // Limpar outros arquivos gerados pelo Whisper (JSON, VTT, SRT, etc)
            const files = fs.readdirSync(outputDir);
            files.forEach(file => {
                if (file.startsWith(audioName) && file !== audioName) {
                    try {
                        fs.unlinkSync(path.join(outputDir, file));
                    } catch (e) {
                        // Ignorar erros de limpeza
                    }
                }
            });
        } catch (cleanupErr) {
            console.warn(`[Whisper Local] Aviso: Não foi possível remover alguns arquivos temporários:`, cleanupErr.message);
        }
        
        return transcriptText;
    } catch (err) {
        // Limpar arquivo temporário em caso de erro
        try {
            if (fs.existsSync(audioPath)) {
                fs.unlinkSync(audioPath);
            }
        } catch (cleanupErr) {
            console.warn(`[Whisper Local] Erro ao limpar arquivo:`, cleanupErr.message);
        }
        throw err;
    }
}

/**
 * Baixa vídeo de URL (YouTube ou MP4 direto) e extrai áudio
 */
async function downloadVideoAndExtractAudio(videoUrl) {
    const tempVideo = path.join(TEMP_DIR, `video_${Date.now()}.mp4`);
    const tempAudio = path.join(TEMP_DIR, `audio_${Date.now()}.wav`);
    
    try {
        console.log(`[Download] 🎬 Baixando vídeo de: ${videoUrl}`);
        
        // Verificar se é URL do YouTube
        if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
            // Extrair ID do vídeo
            let videoId = null;
            if (videoUrl.includes('youtu.be')) {
                videoId = videoUrl.split('youtu.be/')[1]?.split('?')[0];
            } else {
                const urlObj = new URL(videoUrl);
                videoId = urlObj.searchParams.get('v');
            }
            
            if (videoId) {
                // Usar método existente para baixar áudio do YouTube
                return await downloadAndExtractAudio(videoId);
            }
        }
        
        // Para URLs diretas de vídeo (MP4, etc)
        console.log(`[Download] Baixando vídeo direto...`);
        const response = await axios.get(videoUrl, { 
            responseType: 'arraybuffer',
            timeout: 300000 // 5 minutos
        });
        fs.writeFileSync(tempVideo, response.data);
        
        console.log(`[Download] 🎧 Extraindo áudio...`);
        await new Promise((resolve, reject) => {
            ffmpeg(tempVideo)
                .noVideo()
                .audioCodec('pcm_s16le')
                .audioChannels(1)
                .audioFrequency(16000)
                .save(tempAudio)
                .on('end', resolve)
                .on('error', reject);
        });
        
        // Limpar vídeo temporário
        try {
            fs.unlinkSync(tempVideo);
        } catch (e) {}
        
        return tempAudio;
    } catch (err) {
        // Limpar arquivos temporários em caso de erro
        try {
            if (fs.existsSync(tempVideo)) fs.unlinkSync(tempVideo);
            if (fs.existsSync(tempAudio)) fs.unlinkSync(tempAudio);
        } catch (e) {}
        throw err;
    }
}

// === ROTAS DE TRANSCRIÇÃO ===

/**
 * Rota para transcrever vídeo por URL (YouTube ou MP4 direto)
 * Usa Whisper LOCAL (open-source, sem API Key)
 * GET /api/transcribe?url=https://www.youtube.com/watch?v=XXXXX
 * GET /api/transcribe?url=https://meusite.com/video.mp4
 */
app.get('/api/transcribe', authenticateToken, async (req, res) => {
    const videoUrl = req.query.url;
    
    if (!videoUrl) {
        return res.status(400).json({ 
            error: 'URL obrigatória',
            msg: 'Forneça a URL do vídeo no parâmetro ?url='
        });
    }
    
    let tempAudio = null;
    
    try {
        console.log(`[Transcribe] 🎬 Iniciando transcrição para: ${videoUrl}`);
        
        // 1. Baixar vídeo e extrair áudio
        tempAudio = await downloadVideoAndExtractAudio(videoUrl);
        
        // 2. Transcrever com Whisper local
        const transcript = await transcribeWithWhisperLocal(tempAudio);
        
        console.log(`[Transcribe] ✅ Transcrição concluída!`);
        res.json({ 
            success: true, 
            text: transcript,
            source: 'whisper-local'
        });
    } catch (err) {
        console.error(`[Transcribe] ❌ Erro na transcrição:`, err.message);
        
        // Limpar arquivo temporário em caso de erro
        if (tempAudio && fs.existsSync(tempAudio)) {
            try {
                fs.unlinkSync(tempAudio);
            } catch (e) {}
        }
        
        res.status(500).json({ 
            error: 'Falha ao transcrever vídeo',
            msg: err.message || 'Erro desconhecido',
            hint: err.message?.includes('Whisper local não está instalado') 
                ? 'Instale Whisper com: pip install openai-whisper'
                : undefined
        });
    }
});

// === ROTAS DE AGENTES DE ROTEIRO ===

// Rota para obter transcrição completa de um vídeo
app.get('/api/video/transcript/:videoId', authenticateToken, async (req, res) => {
    let { videoId } = req.params;
    const userId = req.user.id;

    console.log(`[Transcrição] Rota chamada - Parâmetro recebido: "${videoId}"`);
    console.log(`[Transcrição] User ID: ${userId}`);
    
    // Garantir que a resposta não será fechada prematuramente
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=900'); // 15 minutos

    // Validar e limpar o ID do vídeo (fazer isso antes de qualquer coisa)
    let cleanVideoId = videoId.trim();
    
    // Se for uma URL completa, extrair o ID
    if (cleanVideoId.includes('youtube.com') || cleanVideoId.includes('youtu.be')) {
        try {
            const urlObj = new URL(cleanVideoId.includes('http') ? cleanVideoId : `https://${cleanVideoId}`);
            if (urlObj.hostname.includes('youtu.be')) {
                cleanVideoId = urlObj.pathname.substring(1);
            } else {
                cleanVideoId = urlObj.searchParams.get('v') || cleanVideoId;
            }
        } catch (urlErr) {
            console.warn(`[Transcrição] Erro ao processar URL, usando como ID: ${cleanVideoId}`);
        }
    }

    try {
        // Primeiro, tentar buscar do banco de dados (cache)
        const analysis = await db.get(
            'SELECT full_transcript FROM analyzed_videos WHERE youtube_video_id = ? AND user_id = ? ORDER BY analyzed_at DESC LIMIT 1',
            [cleanVideoId, userId]
        );

        if (analysis && analysis.full_transcript) {
            console.log(`[Transcrição] ✓ Transcrição encontrada no cache`);
            return res.status(200).json({ 
                transcript: analysis.full_transcript,
                source: 'database'
            });
        }

        // Buscar título do vídeo do banco de dados para detectar idioma
        let videoTitle = null;
        try {
            const videoData = await db.get(
                'SELECT original_title FROM analyzed_videos WHERE youtube_video_id = ? AND user_id = ? ORDER BY analyzed_at DESC LIMIT 1',
                [cleanVideoId, userId]
            );
            if (videoData && videoData.original_title) {
                videoTitle = videoData.original_title;
                console.log(`[Transcrição] Título encontrado: ${videoTitle}`);
            }
        } catch (titleErr) {
            console.warn(`[Transcrição] Não foi possível buscar título do vídeo:`, titleErr.message);
        }
        
        // Usar sistema de fallback com múltiplos métodos
        console.log(`[Transcrição] Buscando transcrição com sistema de fallback para vídeo ID: ${cleanVideoId}`);
        console.log(`[Transcrição] URL do vídeo: https://www.youtube.com/watch?v=${cleanVideoId}`);
        
        try {
            const videoUrl = `https://www.youtube.com/watch?v=${cleanVideoId}`;
            const result = await getTranscriptWithFallback(videoUrl, userId, videoTitle);
            
            if (result.transcript && result.transcript.trim().length > 0) {
                console.log(`[Transcrição] ✓✓✓ SUCESSO com ${result.source}! (${result.transcript.length} caracteres)`);
                
                // Salvar no banco de dados para cache
                try {
                    await db.run(
                        'UPDATE analyzed_videos SET full_transcript = ? WHERE youtube_video_id = ? AND user_id = ?',
                        [result.transcript, cleanVideoId, userId]
                    );
                } catch (dbErr) {
                    console.warn(`[Transcrição] Aviso: Não foi possível salvar transcrição no banco:`, dbErr.message);
                }
                
                return res.status(200).json({ 
                    transcript: result.transcript,
                    source: result.source
                });
            } else {
                throw new Error('Transcrição vazia retornada');
            }
        } catch (transcriptErr) {
            console.error(`[Transcrição] ✗✗✗ FALHA com todos os métodos:`, transcriptErr.message);
            console.error(`[Transcrição] Stack trace:`, transcriptErr.stack?.substring(0, 300));
            
            // Retornar erro específico
            let userMessage = 'Não foi possível obter a transcrição deste vídeo.';
            let statusCode = 404;
            
            if (transcriptErr.message.includes('Whisper não está instalado')) {
                userMessage = 'Transcrição via legendas falhou. Para usar transcrição de áudio, instale o Whisper oficial da OpenAI:\n\n1. Abra o terminal/PowerShell\n2. Execute: pip install -U openai-whisper\n3. Certifique-se de ter o FFmpeg instalado (já está no projeto)\n\nDocumentação: https://github.com/openai/whisper\n\nAlternativamente, você pode colar a transcrição manualmente ao criar o agente de roteiro.';
            } else if (transcriptErr.message.includes('Todos os métodos de transcrição falharam')) {
                userMessage = 'Não foi possível obter a transcrição com nenhum método disponível.\n\nPossíveis soluções:\n1. Verifique se o vídeo possui legendas habilitadas no YouTube\n2. Instale o Whisper local: pip install -U openai-whisper\n3. Cole a transcrição manualmente ao criar o agente de roteiro';
            } else {
                userMessage = `Erro ao buscar transcrição: ${transcriptErr.message}`;
            }
            
            if (!res.headersSent) {
                return res.status(statusCode).json({ 
                    msg: userMessage,
                    error: process.env.NODE_ENV === 'development' ? {
                        error: transcriptErr.message,
                        videoId: cleanVideoId,
                        videoUrl: `https://www.youtube.com/watch?v=${cleanVideoId}`
                    } : undefined
                });
            }
        }
    } catch (err) {
        console.error('[ERRO NA ROTA /api/video/transcript]:', err);
        console.error('[ERRO Stack]:', err.stack?.substring(0, 500));
        
        // Garantir que sempre retornamos uma resposta, mesmo em caso de erro
        if (!res.headersSent) {
            try {
                res.status(500).json({ 
                    msg: err.message || 'Erro ao obter transcrição do vídeo.',
                    error: process.env.NODE_ENV === 'development' ? {
                        message: err.message,
                        stack: err.stack?.substring(0, 300)
                    } : undefined
                });
            } catch (responseErr) {
                console.error('[ERRO ao enviar resposta de erro]:', responseErr);
            }
        } else {
            console.warn('[AVISO] Tentativa de enviar resposta quando headers já foram enviados');
        }
    }
});

app.post('/api/video/transcript/analyze', authenticateToken, async (req, res) => {
    const { transcript, videoId, videoTitle, niche, subniche } = req.body || {};
    const userId = req.user.id;

    if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 400) {
        return res.status(400).json({ msg: 'Forneça a transcrição completa (mínimo ~400 caracteres) para gerar a análise.' });
    }

    try {
        const result = await analyzeTranscriptForVirality({
            userId,
            transcript,
            videoTitle,
            niche,
            subniche
        });

        res.status(200).json({
            analysis: result.analysis,
            provider: result.provider,
            videoId: videoId || null
        });
    } catch (err) {
        console.error('[ERRO /api/video/transcript/analyze]:', err);
        res.status(500).json({ msg: err.message || 'Erro ao analisar o roteiro.' });
    }
});

// Rota para criar um agente de roteiro a partir de um vídeo transcrito
app.post('/api/script-agents/create', authenticateToken, async (req, res) => {
    const { videoId, videoUrl, videoTitle, agentName, niche, subniche, manualTranscript, viralInsights } = req.body;
    const userId = req.user.id;

    if (!videoId || !agentName) {
        return res.status(400).json({ msg: 'ID do vídeo e nome do agente são obrigatórios.' });
    }

    try {
        // PRIORIDADE 1: Usar transcrição manual se fornecida
        let fullTranscript = null;
        
        if (manualTranscript && manualTranscript.trim().length > 0) {
            fullTranscript = manualTranscript.trim();
            console.log(`[Agente] ✅ Usando transcrição manual fornecida pelo usuário (${fullTranscript.length} caracteres)`);
        } else {
            // PRIORIDADE 2: Buscar transcrição do banco de dados
            try {
                const analysis = await db.get(
                    'SELECT full_transcript FROM analyzed_videos WHERE youtube_video_id = ? AND user_id = ? ORDER BY analyzed_at DESC LIMIT 1',
                    [videoId, userId]
                );

                if (analysis && analysis.full_transcript) {
                    fullTranscript = analysis.full_transcript;
                    console.log(`[Agente] ✅ Usando transcrição do banco de dados (${fullTranscript.length} caracteres)`);
                } else {
                    // PRIORIDADE 3: Tentar buscar diretamente do YouTube (fallback antigo)
                    console.log(`[Agente] ⚠️ Transcrição não encontrada no banco, tentando método alternativo...`);
                    const geminiKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, 'gemini']);
                    if (geminiKeyData) {
                        const geminiApiKey = decrypt(geminiKeyData.api_key);
                        if (geminiApiKey) {
                            try {
                                const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);
                                fullTranscript = transcriptData.map(t => t.text).join(' ');
                                console.log(`[Agente] ✅ Transcrição obtida via YouTube Transcript (${fullTranscript.length} caracteres)`);
                            } catch (ytErr) {
                                console.warn(`[Agente] ⚠️ Falha ao buscar transcrição via YouTube Transcript:`, ytErr.message);
                            }
                        }
                    }
                }
            } catch (transcriptErr) {
                console.warn('[Agente] Erro ao obter transcrição:', transcriptErr.message);
            }
        }

        // Se não houver transcrição, permitir criar agente básico (será criado com prompt básico)
        if (!fullTranscript || fullTranscript.trim().length < 100) {
            console.warn(`[Agente] ⚠️ Transcrição não disponível ou muito curta (${fullTranscript?.length || 0} caracteres). Criando agente com prompt básico.`);
            // Não retornar erro, mas criar agente com prompt básico baseado apenas no título e nicho
        }

        // Buscar provedor de IA preferencial (Claude > GPT > Gemini)
        const aiProvider = await getPreferredAIProvider(userId, ['claude', 'openai', 'gemini']);
        if (!aiProvider) {
            return res.status(400).json({ msg: 'Configure uma chave do Claude, OpenAI ou Gemini para criar agentes.' });
        }

        // Criar prompt para o agente usando IA
        let agentPrompt;
        let insightsSection = '';
        if (viralInsights && typeof viralInsights === 'object') {
            try {
                const serializedInsights = JSON.stringify(viralInsights);
                insightsSection = `\nINSIGHTS DO VÍDEO VIRAL (checklist e diferencial identificados anteriormente):\n${serializedInsights.substring(0, 6000)}\n`;
            } catch (err) {
                console.warn('[Agente] Não foi possível serializar viralInsights:', err.message);
            }
        }
        
        if (fullTranscript && fullTranscript.trim().length >= 100) {
            // Usar o roteiro completo (ou até 20000 caracteres para análise mais profunda)
            const transcriptToAnalyze = fullTranscript.length > 20000 
                ? fullTranscript.substring(0, 20000) + '\n[... roteiro continua ...]'
                : fullTranscript;
            
            agentPrompt = `Você é um ESPECIALISTA EM ANÁLISE DE ROTEIROS VIRAIS para YouTube. Sua missão é analisar profundamente o roteiro transcrito abaixo e identificar EXATAMENTE por que ele foi viral, capturando sua fórmula completa para replicação.

ROTEIRO COMPLETO DO VÍDEO VIRAL (TRANSCRITO):
${transcriptToAnalyze}

TÍTULO DO VÍDEO: ${videoTitle || 'N/A'}
NICHE: ${niche || 'N/A'}
SUBNICHE: ${subniche || 'N/A'}

ANÁLISE PROFUNDA REQUERIDA:

1. **ESTRUTURA NARRATIVA EXATA:**
   - Como o roteiro começa? (primeiros 15-30 segundos)
   - Qual é a progressão da narrativa? (desenvolvimento, clímax, resolução)
   - Como termina? (últimos 30 segundos)
   - Identifique a estrutura temporal exata (timing de cada seção)

2. **ELEMENTOS VIRAIS IDENTIFICADOS:**
   - Ganchos específicos usados (perguntas, afirmações chocantes, curiosidade)
   - Técnicas de engajamento (quando pede like, compartilhar, comentar)
   - Ritmo e cadência da narrativa (rápido, lento, variado)
   - Tom de voz (sério, descontraído, emocional, informativo)
   - Elementos de suspense e curiosidade
   - Transições entre tópicos

3. **FÓRMULA DO SUCESSO:**
   - Por que este roteiro específico foi viral?
   - Quais padrões se repetem que geram engajamento?
   - O que mantém o espectador assistindo até o final?
   - Elementos únicos que diferenciam este roteiro

4. **PADRÕES REPLICÁVEIS:**
   - Estrutura que pode ser aplicada a outros títulos
   - Elementos que devem ser mantidos em qualquer replicação
   - Variações permitidas sem perder a essência viral

Sua tarefa é criar um "agente de roteiro" que capture COMPLETAMENTE esta fórmula viral e seja capaz de replicá-la para QUALQUER título fornecido, mantendo a mesma estrutura e elementos virais identificados.

Crie:`;
        } else {
            // Se não houver transcrição, criar um prompt básico baseado apenas no título e nicho
            agentPrompt = `Você é um especialista em criar roteiros virais para YouTube. Crie um "agente de roteiro" baseado nas informações disponíveis sobre um vídeo de sucesso.

TÍTULO DO VÍDEO: ${videoTitle || 'N/A'}
NICHE: ${niche || 'N/A'}
SUBNICHE: ${subniche || 'N/A'}

NOTA: A transcrição completa do vídeo não está disponível, mas você deve criar um agente de roteiro baseado no título, nicho e subnicho fornecidos. O agente deve ser capaz de gerar roteiros virais seguindo o padrão sugerido pelo título e contexto do nicho.

Crie:`;
        }

        agentPrompt += `${insightsSection}
IMPORTANTE:
- NÃO copie o texto do roteiro original.
- Extraia apenas a FÓRMULA, estrutura, ritmo e gatilhos que tornam o vídeo viral.
- Inclua melhorias e correções para levar o resultado a nível 10/10.
- Produza prompts e instruções claros para que qualquer novo título possa reutilizar essa fórmula com diferenciais.
`;

        agentPrompt += `
1. **"agent_prompt"**: Um prompt base que será usado para gerar novos roteiros. Este prompt deve:
   - Capturar a estrutura narrativa exata identificada no roteiro viral
   - Incluir os elementos virais específicos (ganchos, ritmo, tom, técnicas)
   - Ser capaz de adaptar essa estrutura para QUALQUER título fornecido
   - Manter a fórmula de sucesso identificada

2. **"agent_instructions"**: Instruções detalhadas que explicam:
   - A estrutura exata do roteiro (timing, seções, progressão)
   - Os elementos virais que DEVEM ser mantidos em cada replicação
   - Como adaptar o conteúdo para novos títulos mantendo a essência
   - Padrões e fórmulas identificadas que geram engajamento
   - Exemplos específicos do roteiro original que devem ser replicados

IMPORTANTE: O agente deve ser capaz de receber APENAS um título de vídeo e gerar um roteiro completo seguindo EXATAMENTE a mesma estrutura e fórmula viral do roteiro original analisado.

Responda APENAS com um objeto JSON válido no seguinte formato:
{
  "agent_prompt": "Prompt base detalhado que captura a estrutura e elementos virais do roteiro original...",
  "agent_instructions": "Instruções completas sobre a estrutura exata, timing, elementos virais, e como replicar a fórmula para qualquer título..."
}`;

        let response;
        if (aiProvider.service === 'claude') {
            response = await callClaudeAPI(agentPrompt, aiProvider.apiKey, aiProvider.model);
        } else if (aiProvider.service === 'openai') {
            response = await callOpenAIAPI(agentPrompt, aiProvider.apiKey, aiProvider.model);
        } else {
            response = await callGeminiAPI(agentPrompt, aiProvider.apiKey, aiProvider.model);
        }
        
        // Extrair o texto da resposta do Gemini
        let responseText = '';
        if (response && response.titles) {
            responseText = response.titles;
        } else if (typeof response === 'string') {
            responseText = response;
        } else {
            console.error(`[Agente] Formato de resposta inesperado:`, typeof response);
            throw new Error('Formato de resposta inesperado da API Gemini');
        }
        
        console.log(`[Agente] Resposta recebida (primeiros 500 caracteres):`, responseText.substring(0, 500));
        
        let agentPromptText = '';
        let agentInstructions = '';

        try {
            // Como o Gemini está configurado com responseMimeType: "application/json",
            // a resposta deve ser JSON válido diretamente
            let parsed;
            
            // Tentar parsear diretamente como JSON
            try {
                parsed = JSON.parse(responseText);
            } catch (directParseError) {
                // Se falhar, tentar extrair JSON da resposta (pode ter markdown ou texto extra)
                let jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (!jsonMatch) {
                    // Tentar encontrar JSON entre markdown code blocks
                    jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                    if (jsonMatch && jsonMatch[1]) {
                        parsed = JSON.parse(jsonMatch[1]);
                    } else {
                        throw new Error('Nenhum JSON encontrado na resposta');
                    }
                } else {
                    // Limpar e parsear JSON extraído
                    const cleanedJson = jsonMatch[0]
                        .replace(/```json|```/g, '')
                        .trim();
                    parsed = JSON.parse(cleanedJson);
                }
            }
            
            // Verificar se o JSON tem os campos esperados
            if (parsed && parsed.agent_prompt && parsed.agent_instructions) {
                agentPromptText = parsed.agent_prompt;
                agentInstructions = parsed.agent_instructions;
                console.log(`[Agente] ✅ Agente criado com sucesso a partir da resposta do Gemini`);
            } else {
                console.warn(`[Agente] JSON parseado mas campos ausentes. Campos encontrados:`, Object.keys(parsed || {}));
                throw new Error('JSON não contém agent_prompt e agent_instructions');
            }
        } catch (parseError) {
            console.warn(`[Agente] Erro ao parsear resposta do Gemini:`, parseError.message);
            console.log(`[Agente] Resposta completa recebida:`, responseText);
            
            // Fallback: criar um prompt básico baseado no vídeo
            agentPromptText = `Você é um roteirista especializado em criar documentários virais para YouTube. Analise o seguinte padrão comprovado e crie um novo roteiro de documentário cativante e informativo.

**Padrão de Sucesso (baseado no vídeo "${videoTitle}"):**
- Estrutura narrativa envolvente com ganchos poderosos
- Ritmo dinâmico que mantém o espectador engajado
- Informações precisas apresentadas de forma acessível
- Elementos visuais e sonoros que complementam a narrativa

**Nicho:** ${niche || 'N/A'}
**Sub-nicho:** ${subniche || 'N/A'}

Crie roteiros seguindo esta estrutura e estilo, adaptando o conteúdo para novos tópicos dentro do mesmo nicho.`;

            agentInstructions = `Este agente foi criado a partir do vídeo "${videoTitle || 'N/A'}".

**Como usar:**
1. Forneça um novo tópico dentro do nicho "${niche || 'geral'}"
2. O agente gerará um roteiro seguindo a mesma estrutura e estilo do vídeo original
3. Mantenha os elementos que tornaram o vídeo original um sucesso: ganchos poderosos, ritmo envolvente, estrutura narrativa clara

**Elementos virais identificados:**
- Abertura enigmática que captura atenção imediata
- Desenvolvimento progressivo da narrativa
- Informações apresentadas de forma envolvente
- Conclusão que deixa o espectador querendo mais`;
            
            console.log(`[Agente] Usando fallback: prompt básico criado`);
        }

        // Salvar o agente no banco de dados
        const result = await db.run(
            `INSERT INTO script_agents (user_id, agent_name, niche, subniche, source_video_id, source_video_url, source_video_title, full_transcript, agent_prompt, agent_instructions)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, agentName, niche || null, subniche || null, videoId, videoUrl || null, videoTitle || null, fullTranscript, agentPromptText, agentInstructions]
        );

        res.status(200).json({
            msg: 'Agente de roteiro criado com sucesso!',
            agentId: result.lastID,
            agent: {
                id: result.lastID,
                name: agentName,
                niche: niche || null,
                subniche: subniche || null
            }
        });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/script-agents/create]:', err);
        res.status(500).json({ msg: err.message || 'Erro ao criar agente de roteiro.' });
    }
});

// Rota para listar todos os agentes de roteiro do usuário
app.get('/api/script-agents', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const agents = await db.all(
            `SELECT id, agent_name, niche, subniche, source_video_title, usage_count, created_at, updated_at
             FROM script_agents
             WHERE user_id = ?
             ORDER BY updated_at DESC`,
            [userId]
        );

        res.status(200).json({ agents });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/script-agents]:', err);
        res.status(500).json({ msg: 'Erro ao listar agentes de roteiro.' });
    }
});

// Rota para obter detalhes de um agente específico
app.get('/api/script-agents/:agentId', authenticateToken, async (req, res) => {
    const { agentId } = req.params;
    const userId = req.user.id;

    try {
        const agent = await db.get(
            `SELECT * FROM script_agents WHERE id = ? AND user_id = ?`,
            [agentId, userId]
        );

        if (!agent) {
            return res.status(404).json({ msg: 'Agente não encontrado.' });
        }

        res.status(200).json({ agent });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/script-agents/:agentId]:', err);
        res.status(500).json({ msg: 'Erro ao buscar agente.' });
    }
});

// Função helper para enviar progresso via SSE
function sendProgress(sessionId, data) {
    const client = sseClients.get(sessionId);
    if (client) {
        client.write(`data: ${JSON.stringify(data)}\n\n`);
    }
}

// Rota SSE para progresso em tempo real
app.get('/api/script-agents/progress/:sessionId', authenticateToken, (req, res) => {
    const { sessionId } = req.params;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    sseClients.set(sessionId, res);
    
    req.on('close', () => {
        sseClients.delete(sessionId);
    });
});

// Rota para gerar roteiro usando um agente
app.post('/api/script-agents/:agentId/generate', authenticateToken, async (req, res) => {
    const { agentId } = req.params;
    const { title, topic, duration, language, cta, model, additionalInstructions, sessionId } = req.body;
    const userId = req.user.id;

    if (!title) {
        return res.status(400).json({ msg: 'Título do vídeo é obrigatório.' });
    }

    // Se não fornecer duração, usar 5 minutos como padrão
    const scriptDuration = duration ? parseInt(duration) : 5;
    
    // Se não fornecer idioma, usar português como padrão
    const scriptLanguage = language || 'pt';
    
    // Configurar CTAs (Call to Action)
    const ctaConfig = {
        inicio: cta?.inicio || false,
        meio: cta?.meio || false,
        final: cta?.final !== undefined ? cta.final : true // Padrão: CTA no final
    };
    
    // Se não fornecer modelo, usar Gemini como padrão
    const selectedModel = model || 'gemini-2.0-flash';

    try {
        // Buscar o agente
        const agent = await db.get(
            `SELECT * FROM script_agents WHERE id = ? AND user_id = ?`,
            [agentId, userId]
        );

        if (!agent) {
            return res.status(404).json({ msg: 'Agente não encontrado.' });
        }

        // Identificar serviço e buscar chave
        let service;
        if (selectedModel.startsWith('gemini')) service = 'gemini';
        else if (selectedModel.startsWith('claude')) service = 'claude';
        else if (selectedModel.startsWith('gpt')) service = 'openai';
        else service = 'gemini';

        const keyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, service]);
        if (!keyData) {
            return res.status(400).json({ msg: `Chave de API do ${service} não configurada.` });
        }
        const decryptedKey = decrypt(keyData.api_key);
        if (!decryptedKey) {
            return res.status(500).json({ msg: 'Falha ao desencriptar a chave de API.' });
        }

        // Dividir em partes de 3 minutos se a duração for maior que 5 minutos
        const partDuration = scriptDuration > 5 ? 3 : scriptDuration;
        const numberOfParts = Math.ceil(scriptDuration / partDuration);
        const wordsPerPart = partDuration * 150;
        
        console.log(`[Roteiro] Duração: ${scriptDuration} minutos. Dividindo em ${numberOfParts} parte(s) de ${partDuration} minutos cada (~${wordsPerPart} palavras por parte)`);

        let scriptContent = '';

        // Se for dividido em partes, gerar cada parte separadamente
        if (numberOfParts > 1) {
            console.log(`[Roteiro] Gerando roteiro em ${numberOfParts} partes...`);
            const scriptParts = [];
            
            // Enviar progresso inicial
            if (sessionId) {
                sendProgress(sessionId, {
                    stage: 'generating',
                    progress: 0,
                    currentPart: 0,
                    totalParts: numberOfParts,
                    message: `Iniciando geração de ${numberOfParts} partes...`
                });
            }
            
            for (let partIndex = 0; partIndex < numberOfParts; partIndex++) {
                const isLastPart = partIndex === numberOfParts - 1;
                const currentPartDuration = isLastPart ? (scriptDuration - (partIndex * partDuration)) : partDuration;
                const currentPartWords = currentPartDuration * 150;
                const partNumber = partIndex + 1;
                
                console.log(`[Roteiro] Gerando parte ${partNumber}/${numberOfParts} (${currentPartDuration} minutos, ~${currentPartWords} palavras)...`);
                
                const partPrompt = `${agent.agent_prompt || 'Crie um roteiro viral para YouTube seguindo a estrutura e fórmula identificada no roteiro viral original.'}

INSTRUÇÕES DETALHADAS DO AGENTE (FÓRMULA VIRAL):
${agent.agent_instructions || ''}

${additionalInstructions ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${additionalInstructions}\n` : ''}

TÍTULO DO VÍDEO PARA O QUAL DEVO CRIAR O ROTEIRO:
"${title}"

IMPORTANTE: Este é apenas a PARTE ${partNumber} de ${numberOfParts} do roteiro completo.

DURAÇÃO DESTA PARTE: ${currentPartDuration} minutos (${currentPartDuration * 60} segundos)

IDIOMA DO ROTEIRO: ${scriptLanguage === 'pt' ? 'Português (Brasil)' : scriptLanguage === 'pt-PT' ? 'Português (Portugal)' : scriptLanguage === 'es' ? 'Español' : scriptLanguage === 'en' ? 'English' : scriptLanguage === 'fr' ? 'Français' : scriptLanguage === 'de' ? 'Deutsch' : scriptLanguage === 'it' ? 'Italiano' : scriptLanguage === 'ru' ? 'Русский' : scriptLanguage === 'ja' ? '日本語' : scriptLanguage === 'zh' ? '中文' : scriptLanguage}

CALL TO ACTION (CTA) - ONDE INCLUIR:
${ctaConfig.inicio && partIndex === 0 ? '- CTA no INÍCIO (primeiros 30 segundos): Incluir chamada para ação (like, subscribe, comentar)' : ''}
${ctaConfig.meio && partIndex === Math.floor(numberOfParts / 2) ? '- CTA no MEIO (aproximadamente na metade do vídeo): Incluir chamada para ação' : ''}
${ctaConfig.final && isLastPart ? '- CTA no FINAL (últimos 30 segundos): Incluir chamada para ação forte (like, subscribe, comentar, compartilhar)' : ''}

${topic ? `TÓPICO ESPECÍFICO (se fornecido): ${topic}\n` : ''}
NICHE: ${agent.niche || 'N/A'}
SUBNICHE: ${agent.subniche || 'N/A'}

TAREFA:
Crie a PARTE ${partNumber} de ${numberOfParts} do roteiro COMPLETO e DETALHADO para o título acima, seguindo EXATAMENTE a mesma estrutura, ritmo, tom e elementos virais identificados no roteiro original.

O roteiro desta parte deve:
- Ter EXATAMENTE ${currentPartDuration} minutos de duração (${currentPartDuration * 60} segundos)
- Replicar a estrutura narrativa exata do roteiro viral original
- Manter os mesmos elementos virais (ganchos, ritmo, tom, técnicas de engajamento)
- Adaptar o conteúdo para o novo título fornecido
- Manter a fórmula de sucesso que tornou o roteiro original viral
- Distribuir o conteúdo proporcionalmente para preencher os ${currentPartDuration} minutos desta parte

FORMATO DE RESPOSTA OBRIGATÓRIO:
- Responda APENAS com o roteiro em TEXTO SIMPLES (não use JSON, não use estruturas de dados)
- NÃO use formato JSON, não use objetos, não use arrays, não use chaves {}
- O roteiro deve ser texto corrido, dividido em parágrafos ou seções claras
- Cada seção pode ter indicação de tempo entre parênteses ou colchetes, mas o conteúdo deve ser texto narrativo direto
- Exemplo de formato correto:
  "[0:00-0:30] Texto do roteiro aqui... 
  
  [0:30-1:30] Continuação do roteiro...
  
  [1:30-3:00] Mais conteúdo..."
  
- NÃO use formato como: {"section": "...", "time": "...", "content": "..."}
- NÃO use listas numeradas ou com marcadores para estruturar o roteiro
- O roteiro deve ser texto narrativo fluido, como se fosse o texto que será narrado no vídeo

REGRAS CRÍTICAS DE DURAÇÃO PARA ESTA PARTE - OBRIGATÓRIO:
- Esta PARTE ${partNumber} do roteiro DEVE ter EXATAMENTE ${currentPartDuration} minutos de duração
- Esta PARTE DEVE ter ENTRE ${currentPartWords - 50} e ${currentPartWords + 50} palavras (150 palavras por minuto)
- META DE PALAVRAS: ${currentPartWords} palavras
- MÍNIMO ACEITÁVEL: ${currentPartWords - 50} palavras
- MÁXIMO ACEITÁVEL: ${currentPartWords + 50} palavras
- ⚠️ CRÍTICO: Se você retornar menos de ${currentPartWords - 50} palavras ou mais de ${currentPartWords + 50} palavras, o roteiro será REJEITADO
- ⚠️ CRÍTICO: NÃO retorne JSON vazio, NÃO retorne objetos, NÃO retorne apenas estrutura - ESCREVA O ROTEIRO COMPLETO COM ${currentPartWords} PALAVRAS
- Se esta parte tiver menos de ${currentPartWords} palavras, você DEVE expandir o conteúdo até atingir EXATAMENTE ${currentPartWords} palavras
- Distribua o conteúdo proporcionalmente para preencher TODOS os ${currentPartDuration} minutos desta parte
- IMPORTANTE: Conte as palavras antes de finalizar. Esta parte DEVE ter entre ${currentPartWords} e ${currentPartWords + 50} palavras
- CRÍTICO: Se você não conseguir gerar ${currentPartWords} palavras, continue expandindo o conteúdo até atingir essa quantidade

CONTEXTO DA PARTE:
${partIndex === 0 ? '- Esta é a PRIMEIRA parte do roteiro. Comece com um gancho poderoso e envolvente.' : ''}
${!isLastPart ? `- Esta é a parte ${partNumber} de ${numberOfParts}. Continue a narrativa de forma fluida, desenvolvendo o tema.` : ''}
${isLastPart ? `- Esta é a ÚLTIMA parte do roteiro (parte ${partNumber} de ${numberOfParts}). Conclua de forma impactante e envolvente.` : ''}
${partIndex > 0 ? `- A parte anterior terminou em um ponto específico. Continue naturalmente a partir desse ponto.` : ''}

RESPOSTA FINAL - CRÍTICO:
- Responda APENAS com o roteiro em TEXTO SIMPLES e DIRETO
- NÃO use JSON, NÃO use objetos {}, NÃO use arrays [], NÃO use chaves ou colchetes para estruturar
- NÃO use formato: {"roteiro": "...", "duracao": "...", "estrutura": "..."}
- NÃO use formato: [{"section": "...", "time": "...", "content": "..."}]
- O roteiro deve ser texto corrido, como se você estivesse escrevendo o texto que será narrado
- Você pode usar [0:00-0:30] para indicar tempo, mas o resto deve ser texto narrativo puro
- IMPORTANTE: O roteiro será usado para VOICE OVER, então escreva de forma natural e fluida
- Use pontos finais e dois pontos para separar frases naturalmente
- Exemplo CORRETO de resposta:
  "[0:00-0:30] Em meio às selvas densas da América Central, duas civilizações se enfrentaram...
  
  [0:30-1:30] Os Mayas, mestres do tempo e da escrita, construíram impérios...
  
  [1:30-3:00] As raízes dos Mayas se estendem por séculos, florescendo nas terras baixas..."
  
- Exemplo ERRADO (NÃO FAÇA ISSO):
  {"roteiro": "texto", "duracao": "15 minutos"}
- O texto deve estar pronto para ser copiado e usado diretamente na narração do vídeo
- NÃO inclua NADA além do roteiro em si - nem explicações, nem metadados, nem JSON
- NÃO mencione que é "parte X" no texto do roteiro - escreva como se fosse um roteiro contínuo
- Meta de palavras para ESTA PARTE: ${currentPartWords} palavras para ${currentPartDuration} minutos`;

                try {
                    console.log(`[Roteiro] Chamando API ${service} para parte ${partNumber}...`);
                    
                    // Enviar progresso da parte atual
                    if (sessionId) {
                        const partProgress = Math.round((partIndex / numberOfParts) * 90); // 0-90% para geração
                        sendProgress(sessionId, {
                            stage: 'generating',
                            progress: partProgress,
                            currentPart: partNumber,
                            totalParts: numberOfParts,
                            message: `Gerando parte ${partNumber}/${numberOfParts}...`
                        });
                    }
                    
                    let partResponse;
                    if (service === 'gemini') {
                        partResponse = await callGeminiAPI(partPrompt, decryptedKey, selectedModel);
                    } else if (service === 'claude') {
                        partResponse = await callClaudeAPI(partPrompt, decryptedKey, selectedModel);
                    } else {
                        partResponse = await callOpenAIAPI(partPrompt, decryptedKey, selectedModel);
                    }
                    console.log(`[Roteiro] API ${service} respondeu para parte ${partNumber}`);

                    // Limpar resposta da parte
                    let partContent = extractTextFromAIResponse(partResponse).trim();
                    partContent = partContent
                        .replace(/^```[\w]*\n?/gm, '')
                        .replace(/```$/gm, '')
                        .replace(/^\{[\s\S]*?"roteiro"[\s\S]*?\}/g, '')
                        .replace(/"roteiro"\s*:\s*"([^"]+)"/gi, '$1')
                        .replace(/"content"\s*:\s*"([^"]+)"/gi, '$1')
                        .replace(/"script"\s*:\s*"([^"]+)"/gi, '$1')
                        .replace(/\{[\s\S]*\}/g, '')
                        .trim();

                    const partWordCount = partContent.trim().split(/\s+/).filter(w => w.length > 0).length;
                    console.log(`[Roteiro] Parte ${partNumber}/${numberOfParts} gerada: ${partWordCount} palavras (meta: ${currentPartWords})`);

                    // Validar e expandir parte se necessário
                    if (partWordCount < currentPartWords - 50) {
                        console.warn(`[Roteiro] Parte ${partNumber} muito curta: ${partWordCount} palavras. Expandindo...`);
                        const partExpansionPrompt = `O roteiro abaixo é a parte ${partNumber} de ${numberOfParts} e tem apenas ${partWordCount} palavras, mas precisa ter EXATAMENTE ${currentPartWords} palavras.

ROTEIRO DA PARTE ${partNumber} (${partWordCount} palavras - MUITO CURTO):
${partContent}

INSTRUÇÕES:
1. Expanda esta parte para ter EXATAMENTE ${currentPartWords} palavras
2. Mantenha o mesmo estilo e tom
3. Adicione mais detalhes, exemplos, explicações
4. NÃO use JSON, objetos ou arrays - apenas texto corrido
5. Responda APENAS com o roteiro expandido`;

                        try {
                            let expansionResponse;
                            if (service === 'gemini') {
                                expansionResponse = await callGeminiAPI(partExpansionPrompt, decryptedKey, selectedModel);
                            } else if (service === 'claude') {
                                expansionResponse = await callClaudeAPI(partExpansionPrompt, decryptedKey, selectedModel);
                            } else {
                                expansionResponse = await callOpenAIAPI(partExpansionPrompt, decryptedKey, selectedModel);
                            }

                            let expandedPart = extractTextFromAIResponse(expansionResponse).trim()
                                .replace(/^```[\w]*\n?/gm, '')
                                .replace(/```$/gm, '')
                                .replace(/^\{[\s\S]*?"roteiro"[\s\S]*?\}/g, '')
                                .replace(/"roteiro"\s*:\s*"([^"]+)"/gi, '$1')
                                .replace(/\{[\s\S]*\}/g, '')
                                .trim();

                            const expandedWordCount = expandedPart.trim().split(/\s+/).filter(w => w.length > 0).length;
                            if (expandedWordCount >= currentPartWords - 50) {
                                partContent = expandedPart;
                                console.log(`[Roteiro] Parte ${partNumber} expandida: ${expandedWordCount} palavras`);
                            }
                        } catch (expansionErr) {
                            console.error(`[Roteiro] Erro ao expandir parte ${partNumber}:`, expansionErr.message);
                        }
                    }

                    scriptParts.push(partContent);
                } catch (partErr) {
                    console.error(`[Roteiro] ❌ Erro ao gerar parte ${partNumber}:`, partErr.message);
                    
                    // Se foi timeout, informar especificamente
                    if (partErr.message && partErr.message.includes('timeout')) {
                        console.error(`[Roteiro] Parte ${partNumber} teve timeout. Tentando com prompt mais curto...`);
                        try {
                            // Tentar novamente com prompt simplificado
                            const simplifiedPrompt = `Gere a parte ${partNumber} de ${numberOfParts} de um roteiro de ${scriptDuration} minutos sobre: "${title}".
                            
Esta parte deve ter ${currentPartDuration} minutos e aproximadamente ${currentPartWords} palavras.
Responda APENAS com o texto do roteiro, sem JSON ou formatações especiais.`;
                            
                            let retryResponse;
                            if (service === 'gemini') {
                                retryResponse = await callGeminiAPI(simplifiedPrompt, decryptedKey, selectedModel);
                            } else if (service === 'claude') {
                                retryResponse = await callClaudeAPI(simplifiedPrompt, decryptedKey, selectedModel);
                            } else {
                                retryResponse = await callOpenAIAPI(simplifiedPrompt, decryptedKey, selectedModel);
                            }
                            
                            const retryContent = extractTextFromAIResponse(retryResponse).trim();
                            if (retryContent && retryContent.length > 100) {
                                scriptParts.push(retryContent);
                                console.log(`[Roteiro] ✅ Parte ${partNumber} gerada com prompt simplificado`);
                            } else {
                                throw new Error('Retry também falhou');
                            }
                        } catch (retryErr) {
                            console.error(`[Roteiro] Retry falhou para parte ${partNumber}`);
                            scriptParts.push(`[Parte ${partNumber}: Conteúdo em desenvolvimento. Continue a narrativa a partir daqui.]`);
                        }
                    } else {
                        // Outros erros
                        scriptParts.push(`[Parte ${partNumber}: Erro ao gerar. Por favor, tente novamente ou use outro modelo de IA.]`);
                    }
                }
            }

            // Juntar todas as partes
            scriptContent = scriptParts.join('\n\n');
            console.log(`[Roteiro] Todas as ${numberOfParts} partes foram geradas e unidas.`);
        } else {
            // Se não precisa dividir, gerar normalmente
            const scriptPrompt = `${agent.agent_prompt}

TÍTULO DO VÍDEO PARA O QUAL VOCÊ DEVE GERAR O ROTEIRO:
"${title}"

${topic ? `CONTEXTO ADICIONAL FORNECIDO PELO USUÁRIO:
"${topic}"

` : ''}INSTRUÇÕES PARA GERAÇÃO DO ROTEIRO:

O roteiro deve:
- Ter EXATAMENTE ${scriptDuration} minutos de duração (${scriptDuration * 60} segundos)
- Replicar a estrutura narrativa exata do roteiro viral original
- Manter os mesmos elementos virais (ganchos, ritmo, tom, técnicas de engajamento)
- Adaptar o conteúdo para o novo título fornecido
- Incluir timing específico de cada seção para totalizar ${scriptDuration} minutos
- Manter a fórmula de sucesso que tornou o roteiro original viral
- Distribuir o conteúdo proporcionalmente para preencher os ${scriptDuration} minutos

FORMATO DE RESPOSTA OBRIGATÓRIO:
- Responda APENAS com o roteiro em TEXTO SIMPLES (não use JSON, não use estruturas de dados)
- NÃO use formato JSON, não use objetos, não use arrays, não use chaves {}
- O roteiro deve ser texto corrido, dividido em parágrafos ou seções claras
- Cada seção pode ter indicação de tempo entre parênteses ou colchetes, mas o conteúdo deve ser texto narrativo direto
- Exemplo de formato correto:
  "[0:00-0:30] Texto do roteiro aqui... 
  
  [0:30-1:30] Continuação do roteiro...
  
  [1:30-3:00] Mais conteúdo..."
  
- NÃO use formato como: {"section": "...", "time": "...", "content": "..."}
- NÃO use listas numeradas ou com marcadores para estruturar o roteiro
- O roteiro deve ser texto narrativo fluido, como se fosse o texto que será narrado no vídeo

REGRAS CRÍTICAS DE DURAÇÃO - OBRIGATÓRIO:
- O roteiro DEVE ter EXATAMENTE ${scriptDuration} minutos de duração
- O roteiro DEVE ter EXATAMENTE ${scriptDuration * 150} palavras (150 palavras por minuto)
- NÃO aceite menos de ${scriptDuration * 150} palavras - o roteiro DEVE ter NO MÍNIMO ${scriptDuration * 150} palavras
- NÃO aceite mais de ${(scriptDuration * 150) + 100} palavras - o roteiro DEVE ter NO MÁXIMO ${(scriptDuration * 150) + 100} palavras
- Se o roteiro tiver menos de ${scriptDuration * 150} palavras, você DEVE expandir o conteúdo até atingir EXATAMENTE ${scriptDuration * 150} palavras
- Distribua o conteúdo proporcionalmente para preencher TODOS os ${scriptDuration} minutos
- Certifique-se de que o tempo total indicado nas seções some ${scriptDuration} minutos (${scriptDuration * 60} segundos)
- IMPORTANTE: Conte as palavras antes de finalizar. O roteiro DEVE ter entre ${scriptDuration * 150} e ${(scriptDuration * 150) + 100} palavras
- CRÍTICO: Se você não conseguir gerar ${scriptDuration * 150} palavras, continue expandindo o conteúdo até atingir essa quantidade

RESPOSTA FINAL - CRÍTICO:
- Responda APENAS com o roteiro em TEXTO SIMPLES e DIRETO
- NÃO use JSON, NÃO use objetos {}, NÃO use arrays [], NÃO use chaves ou colchetes para estruturar
- NÃO use formato: {"roteiro": "...", "duracao": "...", "estrutura": "..."}
- NÃO use formato: [{"section": "...", "time": "...", "content": "..."}]
- O roteiro deve ser texto corrido, como se você estivesse escrevendo o texto que será narrado
- Você pode usar [0:00-0:30] para indicar tempo, mas o resto deve ser texto narrativo puro
- IMPORTANTE: O roteiro será usado para VOICE OVER, então escreva de forma natural e fluida
- Use pontos finais e dois pontos para separar frases naturalmente
- O texto deve estar pronto para ser copiado e usado diretamente na narração do vídeo
- NÃO inclua NADA além do roteiro em si - nem explicações, nem metadados, nem JSON
- Meta de palavras: aproximadamente ${scriptDuration * 150} palavras para ${scriptDuration} minutos`;

            let apiCallFunction;
            if (service === 'gemini') apiCallFunction = callGeminiAPI;
            else if (service === 'claude') apiCallFunction = callClaudeAPI;
            else apiCallFunction = callOpenAIAPI;

            const originalResponse = await apiCallFunction(scriptPrompt, decryptedKey, selectedModel);
            
            // Extrair conteúdo da resposta (pode vir em diferentes formatos)
            scriptContent = extractTextFromAIResponse(originalResponse) || '';

        // Limpar o roteiro: remover explicações, metadados, markdown, JSON, etc.
        // Garantir que a saída seja apenas o roteiro limpo em texto simples
        scriptContent = scriptContent
            // Remover estruturas JSON completas (objetos e arrays)
            .replace(/\{[\s\S]*?"script"[\s\S]*?\}/g, '')
            .replace(/\{[\s\S]*?"section"[\s\S]*?\}/g, '')
            .replace(/\{[\s\S]*?"content"[\s\S]*?\}/g, '')
            .replace(/\{[\s\S]*?"time"[\s\S]*?\}/g, '')
            // Remover arrays JSON
            .replace(/\[[\s\S]*?\{[\s\S]*?\}[\s\S]*?\]/g, '')
            // Extrair apenas o conteúdo de texto de estruturas JSON (se ainda houver)
            .replace(/"content"\s*:\s*"([^"]+)"/gi, '$1')
            .replace(/"text"\s*:\s*"([^"]+)"/gi, '$1')
            .replace(/"script"\s*:\s*"([^"]+)"/gi, '$1')
            // Remover blocos de código markdown
            .replace(/```[\s\S]*?```/g, '')
            // Remover JSON completo entre chaves (mais agressivo)
            .replace(/\{[^{}]*"roteiro"[\s\S]*?\}/g, '')
            .replace(/\{[^{}]*"duracao"[\s\S]*?\}/g, '')
            .replace(/\{[^{}]*"estrutura"[\s\S]*?\}/g, '')
            .replace(/\{[\s\S]{0,5000}\}/g, '')
            // Remover cabeçalhos markdown excessivos
            .replace(/^#{1,6}\s+.+$/gm, '')
            // Remover linhas que começam com "Roteiro:", "Script:", etc (metadados)
            .replace(/^(Roteiro|Script|Conteúdo|Texto|Output|Resultado|Aqui está|Segue|Abaixo está|Este é o|O roteiro é|title|section|time):\s*/gmi, '')
            // Remover explicações comuns no início/fim
            .replace(/\s*(Espero que|Espero|Boa sorte|Bom trabalho|Sucesso|Bom vídeo)\.?$/gmi, '')
            // Remover aspas JSON restantes
            .replace(/^["']|["']$/gm, '')
            // Remover múltiplas quebras de linha (mais de 2)
            .replace(/\n{3,}/g, '\n\n')
            // Limpar espaços no início e fim
            .trim();
        
        // Se o conteúdo ainda estiver muito curto ou vazio após limpeza, tentar extrair texto de JSON
        if (scriptContent.length < 100) {
            try {
                // Tentar encontrar e parsear JSON na resposta original
                const rawText = typeof originalResponse === 'string'
                    ? originalResponse
                    : JSON.stringify(originalResponse || '');
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const jsonObj = JSON.parse(jsonMatch[0]);
                    
                    if (jsonObj.script && Array.isArray(jsonObj.script)) {
                        // Extrair conteúdo de array de objetos (formato do exemplo do usuário)
                        scriptContent = jsonObj.script.map(item => {
                            if (item.content) {
                                const timeStr = item.time ? `[${item.time}] ` : '';
                                return timeStr + item.content;
                            }
                            if (typeof item === 'string') return item;
                            return '';
                        }).filter(Boolean).join('\n\n');
                    } else if (jsonObj.content) {
                        scriptContent = jsonObj.content;
                    } else if (jsonObj.script && typeof jsonObj.script === 'string') {
                        scriptContent = jsonObj.script;
                    } else if (jsonObj.text) {
                        scriptContent = jsonObj.text;
                    }
                }
            } catch (e) {
                // Se falhar ao parsear JSON, tentar extrair texto diretamente
                console.warn('[Roteiro] Erro ao parsear JSON, tentando extração direta:', e.message);
                
                // Tentar extrair conteúdo de strings JSON sem parsear completamente
                const rawText = typeof originalResponse === 'string'
                    ? originalResponse
                    : JSON.stringify(originalResponse || '');
                const contentMatches = rawText.match(/"content"\s*:\s*"([^"]+)"/gi);
                if (contentMatches && contentMatches.length > 0) {
                    scriptContent = contentMatches.map(match => {
                        const extracted = match.match(/"content"\s*:\s*"([^"]+)"/i);
                        return extracted ? extracted[1] : '';
                    }).filter(Boolean).join('\n\n');
                }
            }
        }
        
            // Garantir que o conteúdo final não esteja vazio
            if (!scriptContent || scriptContent.trim().length < 50) {
                console.warn('[Roteiro] Conteúdo muito curto após limpeza, usando resposta original');
                scriptContent = extractTextFromAIResponse(originalResponse) || '';
            }
        }

        // Validar quantidade de palavras e expandir se necessário
        const expectedWords = scriptDuration * 150;
        const minWords = expectedWords - 50; // Tolerância de -50 palavras
        const maxWords = expectedWords + 100; // Tolerância de +100 palavras
        
        let wordCount = scriptContent.trim().split(/\s+/).filter(w => w.length > 0).length;
        console.log(`[Roteiro] Validação inicial: ${wordCount} palavras encontradas, esperado: ${expectedWords} (tolerância: ${minWords}-${maxWords})`);

        // Tentar expandir até atingir a quantidade mínima (máximo 3 tentativas)
        let expansionAttempts = 0;
        const maxExpansionAttempts = 3;
        
        while (wordCount < minWords && expansionAttempts < maxExpansionAttempts) {
            expansionAttempts++;
            const wordsNeeded = expectedWords - wordCount;
            const expansionRatio = expectedWords / wordCount; // Quantas vezes precisa expandir
            
            console.warn(`[Roteiro] Tentativa ${expansionAttempts}/${maxExpansionAttempts}: Roteiro muito curto: ${wordCount} palavras (mínimo: ${minWords}). Expandindo...`);
            
            // Criar prompt de expansão mais agressivo
            const expansionPrompt = `O roteiro abaixo tem apenas ${wordCount} palavras, mas precisa ter EXATAMENTE ${expectedWords} palavras para ${scriptDuration} minutos de narração.

ROTEIRO ATUAL (${wordCount} palavras - MUITO CURTO):
${scriptContent}

INSTRUÇÕES CRÍTICAS:
1. Você DEVE expandir este roteiro para ter EXATAMENTE ${expectedWords} palavras (atualmente tem apenas ${wordCount})
2. Você precisa adicionar aproximadamente ${wordsNeeded} palavras a mais
3. Mantenha o mesmo estilo, tom e estrutura narrativa
4. Expanda CADA seção do roteiro proporcionalmente
5. Adicione mais detalhes, exemplos concretos, explicações profundas, desenvolvimento de ideias, contexto histórico, curiosidades, análises mais detalhadas
6. NÃO altere o início ou o final, mas expanda significativamente o conteúdo do meio
7. O roteiro deve continuar sendo texto corrido, sem marcações JSON, sem objetos, sem arrays
8. Cada parágrafo deve ser expandido com mais informações relevantes
9. Adicione transições mais elaboradas entre as seções
10. Desenvolva mais profundamente cada ideia apresentada
11. Responda APENAS com o roteiro expandido, sem explicações adicionais, sem metadados, sem JSON
12. CRÍTICO: O roteiro final DEVE ter entre ${expectedWords} e ${expectedWords + 50} palavras

IMPORTANTE: Conte mentalmente as palavras enquanto escreve. Se o roteiro não tiver pelo menos ${expectedWords} palavras, continue expandindo até atingir essa quantidade.`;

            try {
                let expansionResponse;
                if (service === 'gemini') {
                    expansionResponse = await callGeminiAPI(expansionPrompt, decryptedKey, selectedModel);
                } else if (service === 'claude') {
                    expansionResponse = await callClaudeAPI(expansionPrompt, decryptedKey, selectedModel);
                } else {
                    expansionResponse = await callOpenAIAPI(expansionPrompt, decryptedKey, selectedModel);
                }

                // Limpar resposta de expansão
                let expandedContent = extractTextFromAIResponse(expansionResponse).trim();
                expandedContent = expandedContent
                    .replace(/^```[\w]*\n?/gm, '')
                    .replace(/```$/gm, '')
                    .replace(/^\{[\s\S]*?"roteiro"[\s\S]*?\}/g, '')
                    .replace(/"roteiro"\s*:\s*"([^"]+)"/gi, '$1')
                    .replace(/"content"\s*:\s*"([^"]+)"/gi, '$1')
                    .replace(/"script"\s*:\s*"([^"]+)"/gi, '$1')
                    .replace(/\{[\s\S]*\}/g, '')
                    .replace(/\[[\s\S]*?\]/g, '') // Remover arrays JSON
                    .trim();

                const expandedWordCount = expandedContent.trim().split(/\s+/).filter(w => w.length > 0).length;
                console.log(`[Roteiro] Após tentativa ${expansionAttempts}: ${expandedWordCount} palavras (meta: ${expectedWords})`);

                if (expandedWordCount >= minWords) {
                    scriptContent = expandedContent;
                    wordCount = expandedWordCount;
                    console.log(`[Roteiro] ✅ Expansão bem-sucedida! Roteiro agora tem ${wordCount} palavras.`);
                    break; // Sair do loop se atingiu o mínimo
                } else if (expandedWordCount > wordCount) {
                    // Mesmo que não tenha atingido o mínimo, se expandiu, usar o expandido
                    scriptContent = expandedContent;
                    wordCount = expandedWordCount;
                    console.log(`[Roteiro] Roteiro expandido de ${wordCount} para ${expandedWordCount} palavras, mas ainda abaixo do mínimo. Tentando novamente...`);
                } else {
                    console.warn(`[Roteiro] Expansão não aumentou o número de palavras. Tentando abordagem diferente...`);
                }
            } catch (expansionErr) {
                console.error(`[Roteiro] Erro na tentativa ${expansionAttempts} de expansão:`, expansionErr.message);
                // Continuar para próxima tentativa ou usar o que temos
            }
        }

        // Verificação final - se ainda estiver muito curto, fazer uma última tentativa com prompt diferente
        if (wordCount < minWords) {
            console.warn(`[Roteiro] Roteiro ainda muito curto após ${expansionAttempts} tentativas: ${wordCount} palavras. Fazendo última tentativa...`);
            
            // Última tentativa: pedir para duplicar e expandir o conteúdo
            const finalExpansionPrompt = `O roteiro abaixo precisa ser DUPLICADO e EXPANDIDO para ter EXATAMENTE ${expectedWords} palavras.

ROTEIRO ATUAL (${wordCount} palavras):
${scriptContent}

INSTRUÇÕES FINAIS:
1. Você DEVE criar um roteiro com EXATAMENTE ${expectedWords} palavras
2. Mantenha a estrutura e o estilo, mas EXPANDA CADA IDEIA significativamente
3. Adicione exemplos, detalhes, explicações, contexto, curiosidades
4. Desenvolva cada parágrafo com muito mais profundidade
5. NÃO use JSON, objetos ou arrays - apenas texto corrido
6. Responda APENAS com o roteiro expandido`;

            try {
                let finalResponse;
                if (service === 'gemini') {
                    finalResponse = await callGeminiAPI(finalExpansionPrompt, decryptedKey, selectedModel);
                } else if (service === 'claude') {
                    finalResponse = await callClaudeAPI(finalExpansionPrompt, decryptedKey, selectedModel);
                } else {
                    finalResponse = await callOpenAIAPI(finalExpansionPrompt, decryptedKey, selectedModel);
                }

                let finalContent = extractTextFromAIResponse(finalResponse).trim()
                    .replace(/^```[\w]*\n?/gm, '')
                    .replace(/```$/gm, '')
                    .replace(/^\{[\s\S]*?"roteiro"[\s\S]*?\}/g, '')
                    .replace(/"roteiro"\s*:\s*"([^"]+)"/gi, '$1')
                    .replace(/\{[\s\S]*\}/g, '')
                    .trim();

                const finalWordCount = finalContent.trim().split(/\s+/).filter(w => w.length > 0).length;
                if (finalWordCount >= minWords) {
                    scriptContent = finalContent;
                    wordCount = finalWordCount;
                    console.log(`[Roteiro] ✅ Última tentativa bem-sucedida! Roteiro agora tem ${wordCount} palavras.`);
                }
            } catch (finalErr) {
                console.error('[Roteiro] Erro na última tentativa de expansão:', finalErr.message);
            }
        }

        // Verificação final - se ainda estiver muito curto, usar o que temos mas avisar
        const finalWordCount = scriptContent.trim().split(/\s+/).filter(w => w.length > 0).length;
        if (finalWordCount < minWords) {
            console.warn(`[Roteiro] ⚠️ Roteiro final ainda abaixo do mínimo após todas as tentativas: ${finalWordCount} palavras (mínimo: ${minWords})`);
            // Em vez de retornar erro, vamos usar o roteiro mesmo que curto, mas adicionar uma nota
            // O sistema vai continuar funcionando, mas o usuário será avisado
            console.log(`[Roteiro] Usando roteiro com ${finalWordCount} palavras (abaixo do ideal de ${expectedWords}, mas funcional)`);
        } else {
            console.log(`[Roteiro] ✅ Roteiro validado com sucesso: ${finalWordCount} palavras (meta: ${expectedWords})`);
        }

        // === OTIMIZAÇÃO DO ROTEIRO ===
        console.log('[Otimizador] 🔍 Analisando roteiro gerado...');
        
        // Progresso: 90% - Iniciando otimização
        if (sessionId) {
            sendProgress(sessionId, {
                stage: 'optimizing',
                progress: 90,
                message: 'Analisando qualidade do roteiro...'
            });
        }
        
        const optimizer = new ScriptOptimizer(agent.niche || 'geral');
        const analysis = optimizer.analyzeScript(scriptContent);
        const optimizationReport = optimizer.generateReport(analysis);
        
        console.log('[Otimizador] 📊 Análise concluída:');
        console.log(`  - Score Geral: ${analysis.overallScore}/10`);
        console.log(`  - Retenção: ${analysis.retentionScore}/10`);
        console.log(`  - Autenticidade: ${analysis.authenticityScore}/10`);
        console.log(`  - Alinhamento: ${analysis.nicheAlignment}/10`);
        console.log(`  - Problemas detectados: ${analysis.problems.length}`);
        console.log(`  - Indicadores de IA: ${analysis.aiIndicators.length}`);
        console.log(`  - Clichês: ${analysis.cliches.length}`);
        
        // === PÓS-PROCESSAMENTO AUTOMÁTICO ===
        // Se score < 8 ou tem muitos problemas, aplicar otimizações automáticas
        let finalScriptContent = scriptContent;
        let needsOptimization = false;
        let optimizationReason = '';
        
        // 🚨 CRÍTICO: SEMPRE otimizar se há inconsistências de nomes (DESASTRE TOTAL)
        if (analysis.nameInconsistencies && analysis.nameInconsistencies.length > 0) {
            needsOptimization = true;
            optimizationReason = `🚨 DESASTRE TOTAL: ${analysis.nameInconsistencies.length} inconsistências de nomes detectadas`;
            console.log(`[Otimizador] 🚨 CRÍTICO: ${analysis.nameInconsistencies.length} inconsistências de nomes! FORÇANDO otimização...`);
        } 
        // Verificar se precisa otimizar por score baixo
        else if (analysis.overallScore < 8) {
            needsOptimization = true;
            optimizationReason = `Score ${analysis.overallScore}/10 está abaixo de 8`;
            console.log(`[Otimizador] 🔧 ${optimizationReason}. Aplicando correções...`);
        } 
        // Verificar se tem muitos clichês
        else if (analysis.cliches.length > 3) {
            needsOptimization = true;
            optimizationReason = `${analysis.cliches.length} clichês detectados`;
            console.log(`[Otimizador] 🔧 ${optimizationReason}. Aplicando correções...`);
        } 
        // Verificar se tem muitos indicadores de IA
        else if (analysis.aiIndicators.length > 2) {
            needsOptimization = true;
            optimizationReason = `${analysis.aiIndicators.length} indicadores de IA detectados`;
            console.log(`[Otimizador] 🔧 ${optimizationReason}. Aplicando correções...`);
        }
        
        if (needsOptimization) {
            // Progresso: 93% - Otimizando
            if (sessionId) {
                sendProgress(sessionId, {
                    stage: 'optimizing',
                    progress: 93,
                    message: 'Removendo repetições e clichês...'
                });
            }
            
            try {
                // Aplicar otimizações do ScriptOptimizer
                finalScriptContent = optimizer.optimizeScript(scriptContent);
                
                // Remover frases repetidas (problema comum com IA)
                finalScriptContent = removeRepetitions(finalScriptContent);
                
                // Humanizar ainda mais
                finalScriptContent = optimizer.humanizeText(finalScriptContent);
                
                // Re-analisar após otimizações
                const finalAnalysis = optimizer.analyzeScript(finalScriptContent);
                console.log(`[Otimizador] ✅ Otimização concluída! Score melhorado: ${analysis.overallScore}/10 → ${finalAnalysis.overallScore}/10`);
                
                // Atualizar análise
                analysis.overallScore = finalAnalysis.overallScore;
                analysis.retentionScore = finalAnalysis.retentionScore;
                analysis.authenticityScore = finalAnalysis.authenticityScore;
                analysis.nicheAlignment = finalAnalysis.nicheAlignment;
                analysis.problems = finalAnalysis.problems;
                analysis.cliches = finalAnalysis.cliches;
                analysis.aiIndicators = finalAnalysis.aiIndicators;
                analysis.nameInconsistencies = finalAnalysis.nameInconsistencies || [];
                
                // Log se ainda houver inconsistências após otimização
                if (finalAnalysis.nameInconsistencies && finalAnalysis.nameInconsistencies.length > 0) {
                    console.warn(`[Otimizador] ⚠️ ATENÇÃO: Ainda há ${finalAnalysis.nameInconsistencies.length} inconsistências após otimização. Roteiro pode precisar de revisão manual.`);
                }
            } catch (optErr) {
                console.error('[Otimizador] Erro na otimização:', optErr.message);
                console.log('[Otimizador] Usando roteiro original sem otimizações');
                finalScriptContent = scriptContent;
            }
        } else {
            console.log(`[Otimizador] ✅ Roteiro já está em alta qualidade (score ${analysis.overallScore}/10)`);
        }
        
        scriptContent = finalScriptContent;

        // Salvar o roteiro gerado com análise de otimização
        const scriptResult = await db.run(
            `INSERT INTO generated_scripts (user_id, script_agent_id, title, script_content, model_used, niche, subniche, optimization_score, optimization_report, retention_score, authenticity_score)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, agentId, title, scriptContent, selectedModel, agent.niche, agent.subniche, analysis.overallScore, optimizationReport, analysis.retentionScore, analysis.authenticityScore]
        );

        // Atualizar contador de uso do agente
        await db.run(
            `UPDATE script_agents SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [agentId]
        );

        // Garantir que scriptContent não esteja vazio
        if (!scriptContent || scriptContent.trim().length === 0) {
            console.error('[Roteiro] Erro: Roteiro gerado está vazio');
            return res.status(500).json({ 
                msg: 'Erro ao gerar roteiro: O conteúdo retornado está vazio. Tente novamente ou use outro modelo de IA.' 
            });
        }

        // Progresso: 100% - Concluído
        if (sessionId) {
            sendProgress(sessionId, {
                stage: 'complete',
                progress: 100,
                message: 'Roteiro gerado com sucesso!',
                viralScore: analysis.overallScore
            });
        }
        
        res.status(200).json({
            msg: 'Roteiro gerado com sucesso!',
            script: scriptContent,
            scriptId: scriptResult.lastID,
            title: title,
            model: selectedModel,
            duration: scriptDuration,
            language: scriptLanguage,
            wordCount: scriptContent.trim().split(/\s+/).filter(w => w.length > 0).length,
            optimization: {
                overallScore: analysis.overallScore,
                retentionScore: analysis.retentionScore,
                authenticityScore: analysis.authenticityScore,
                nicheAlignment: analysis.nicheAlignment,
                problems: analysis.problems,
                suggestions: analysis.suggestions,
                aiIndicators: analysis.aiIndicators,
                cliches: analysis.cliches,
                nameInconsistencies: analysis.nameInconsistencies || [],
                wasOptimized: needsOptimization,
                optimizationReason: needsOptimization ? optimizationReason : null
            }
        });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/script-agents/:agentId/generate]:', err);
        res.status(500).json({ msg: err.message || 'Erro ao gerar roteiro.' });
    }
});

// Rota para atualizar um agente
app.put('/api/script-agents/:agentId', authenticateToken, async (req, res) => {
    const { agentId } = req.params;
    const { agentName, niche, subniche, agentPrompt, agentInstructions } = req.body;
    const userId = req.user.id;

    try {
        const agent = await db.get(
            `SELECT id FROM script_agents WHERE id = ? AND user_id = ?`,
            [agentId, userId]
        );

        if (!agent) {
            return res.status(404).json({ msg: 'Agente não encontrado.' });
        }

        const updates = [];
        const values = [];

        if (agentName !== undefined) {
            updates.push('agent_name = ?');
            values.push(agentName);
        }
        if (niche !== undefined) {
            updates.push('niche = ?');
            values.push(niche);
        }
        if (subniche !== undefined) {
            updates.push('subniche = ?');
            values.push(subniche);
        }
        if (agentPrompt !== undefined) {
            updates.push('agent_prompt = ?');
            values.push(agentPrompt);
        }
        if (agentInstructions !== undefined) {
            updates.push('agent_instructions = ?');
            values.push(agentInstructions);
        }

        if (updates.length === 0) {
            return res.status(400).json({ msg: 'Nenhum campo para atualizar.' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(agentId);

        await db.run(
            `UPDATE script_agents SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        res.status(200).json({ msg: 'Agente atualizado com sucesso!' });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/script-agents/:agentId PUT]:', err);
        res.status(500).json({ msg: 'Erro ao atualizar agente.' });
    }
});
// Rota para deletar um agente
app.delete('/api/script-agents/:agentId', authenticateToken, async (req, res) => {
    const { agentId } = req.params;
    const userId = req.user.id;

    try {
        const result = await db.run(
            `DELETE FROM script_agents WHERE id = ? AND user_id = ?`,
            [agentId, userId]
        );

        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Agente não encontrado.' });
        }

        res.status(200).json({ msg: 'Agente deletado com sucesso!' });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/script-agents/:agentId DELETE]:', err);
        res.status(500).json({ msg: 'Erro ao deletar agente.' });
    }
});

// Rota para listar roteiros gerados
app.get('/api/scripts', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { agentId } = req.query;

    try {
        let scripts;
        if (agentId) {
            scripts = await db.all(
                `SELECT gs.*, sa.agent_name
                 FROM generated_scripts gs
                 LEFT JOIN script_agents sa ON gs.script_agent_id = sa.id
                 WHERE gs.user_id = ? AND gs.script_agent_id = ?
                 ORDER BY gs.created_at DESC`,
                [userId, agentId]
            );
        } else {
            scripts = await db.all(
                `SELECT gs.*, sa.agent_name
                 FROM generated_scripts gs
                 LEFT JOIN script_agents sa ON gs.script_agent_id = sa.id
                 WHERE gs.user_id = ?
                 ORDER BY gs.created_at DESC`,
                [userId]
            );
        }

        res.status(200).json({ scripts });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/scripts]:', err);
        res.status(500).json({ msg: 'Erro ao listar roteiros.' });
    }
});

// Rota para obter um roteiro específico
app.get('/api/scripts/:id', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const scriptId = req.params.id;

    try {
        const script = await db.get(
            `SELECT gs.*, sa.agent_name
             FROM generated_scripts gs
             LEFT JOIN script_agents sa ON gs.script_agent_id = sa.id
             WHERE gs.id = ? AND gs.user_id = ?`,
            [scriptId, userId]
        );

        if (!script) {
            return res.status(404).json({ msg: 'Roteiro não encontrado.' });
        }

        res.json({ script });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/scripts/:id]:', err);
        res.status(500).json({ msg: 'Erro ao obter roteiro.' });
    }
});

// Rota para deletar um roteiro
app.delete('/api/scripts/:id', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const scriptId = req.params.id;

    try {
        const result = await db.run(
            `DELETE FROM generated_scripts WHERE id = ? AND user_id = ?`,
            [scriptId, userId]
        );

        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Roteiro não encontrado.' });
        }

        res.json({ msg: 'Roteiro excluído com sucesso.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/scripts/:id DELETE]:', err);
        res.status(500).json({ msg: 'Erro ao excluir roteiro.' });
    }
});

// Rota para download de roteiro em formato TXT
app.get('/api/scripts/:id/download/txt', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const scriptId = req.params.id;

    try {
        const script = await db.get(
            `SELECT * FROM generated_scripts WHERE id = ? AND user_id = ?`,
            [scriptId, userId]
        );

        if (!script) {
            return res.status(404).json({ msg: 'Roteiro não encontrado.' });
        }

        // Criar conteúdo TXT com cabeçalho
        let txtContent = `TÍTULO: ${script.title}\n`;
        txtContent += `DATA: ${new Date(script.created_at).toLocaleString('pt-BR')}\n`;
        txtContent += `MODELO: ${script.model_used || 'N/A'}\n`;
        if (script.niche) txtContent += `NICHO: ${script.niche}\n`;
        if (script.subniche) txtContent += `SUBNICHO: ${script.subniche}\n`;
        if (script.optimization_score) {
            txtContent += `\nANÁLISE DE OTIMIZAÇÃO:\n`;
            txtContent += `Score Geral: ${script.optimization_score}/10\n`;
            txtContent += `Retenção: ${script.retention_score}/10\n`;
            txtContent += `Autenticidade: ${script.authenticity_score}/10\n`;
        }
        txtContent += `\n${'='.repeat(60)}\n\nROTEIRO:\n\n`;
        txtContent += script.script_content;
        
        if (script.optimization_report) {
            txtContent += `\n\n${'='.repeat(60)}\n\n`;
            txtContent += script.optimization_report;
        }

        // Definir headers para download
        const filename = `roteiro_${script.id}_${script.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}.txt`;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(txtContent);

    } catch (err) {
        console.error('[ERRO NA ROTA /api/scripts/:id/download/txt]:', err);
        res.status(500).json({ msg: 'Erro ao fazer download do roteiro.' });
    }
});

// Rota para download de roteiro em formato SRT (legendas)
app.get('/api/scripts/:id/download/srt', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const scriptId = req.params.id;

    try {
        const script = await db.get(
            `SELECT * FROM generated_scripts WHERE id = ? AND user_id = ?`,
            [scriptId, userId]
        );

        if (!script) {
            return res.status(404).json({ msg: 'Roteiro não encontrado.' });
        }

        // Converter roteiro em formato SRT
        // Estimativa: 150 palavras por minuto, 3-5 palavras por legenda
        const scriptText = script.script_content;
        const sentences = scriptText.split(/[.!?]\s+/).filter(s => s.trim().length > 0);
        
        let srtContent = '';
        let counter = 1;
        let currentTime = 0; // em segundos
        
        for (const sentence of sentences) {
            const words = sentence.trim().split(/\s+/);
            const wordsPerSubtitle = 8; // Máximo de palavras por legenda
            
            // Dividir sentença em partes menores se necessário
            for (let i = 0; i < words.length; i += wordsPerSubtitle) {
                const chunk = words.slice(i, i + wordsPerSubtitle).join(' ');
                const chunkWords = chunk.split(/\s+/).length;
                const duration = (chunkWords / 150) * 60; // 150 palavras por minuto
                
                // Formatar timestamps
                const startTime = formatSRTTime(currentTime);
                const endTime = formatSRTTime(currentTime + duration);
                
                srtContent += `${counter}\n`;
                srtContent += `${startTime} --> ${endTime}\n`;
                srtContent += `${chunk}\n\n`;
                
                counter++;
                currentTime += duration;
            }
        }

        // Definir headers para download
        const filename = `roteiro_${script.id}_${script.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}.srt`;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(srtContent);

    } catch (err) {
        console.error('[ERRO NA ROTA /api/scripts/:id/download/srt]:', err);
        res.status(500).json({ msg: 'Erro ao fazer download do roteiro em SRT.' });
    }
});

// Função auxiliar para formatar tempo no formato SRT (HH:MM:SS,mmm)
function formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}


// === ROTAS DE EXPLORAÇÃO DE NICHO ===

app.post('/api/niche/find-subniche', authenticateToken, async (req, res) => {
    const { nichePrincipal, ideiaInicial, model } = req.body;
    const userId = req.user.id;

    if (!nichePrincipal || !ideiaInicial || !model) {
        return res.status(400).json({ msg: 'Todos os campos são obrigatórios.' });
    }

    try {
        const prompt = `
            Você é um ESPECIALISTA EM CRIAÇÃO DE CANAIS MILIONÁRIOS NO YOUTUBE com experiência em identificar oportunidades de subnichos com alto potencial de viralização.
            
            OBJETIVO: Encontrar um subnicho dentro de "${nichePrincipal}" que permita criar um canal MILIONÁRIO com MILHÕES DE VIEWS, ALTO CTR e conteúdo que VIRALIZE.
            
            PROMPT INICIAL PARA EDUCAR O GPT:
            Quero criar um canal no YouTube dentro do nicho de "${nichePrincipal}", inicialmente pensei em abordar "${ideiaInicial}", mas percebi que já há bastante concorrência nesse subnicho. 
            
            Estou em busca de uma ideia de subnicho dentro de "${nichePrincipal}" que:
            - Ainda esteja pouco explorada no YouTube, com pouca ou nenhuma concorrência
            - Tenha alto volume de buscas e interesse crescente
            - Tenha bom potencial de monetização
            - TENHA ALTO POTENCIAL DE VIRALIZAÇÃO e capacidade de gerar milhões de views
            - Permita criar conteúdo com alto CTR (acima de 25%)
            - Tenha oportunidades de criar títulos e thumbnails virais
            
            O objetivo é encontrar uma oportunidade única para criar conteúdo relevante, com forte demanda, baixa competição, e POTENCIAL PARA CRIAR UM CANAL MILIONÁRIO com milhões de views e alto CTR.
            
            Com base em dados atuais e tendências, o que você recomenda? Forneça uma análise detalhada que inclua:
            - O subnicho recomendado e por que ele tem potencial para gerar milhões de views
            - Análise de concorrência e oportunidades
            - Potencial de viralização e alto CTR
            - Estratégias para criar conteúdo que viralize
            - Sugestões de títulos e thumbnails que gerem alto CTR
        `;

        let service;
        if (model.startsWith('gemini')) service = 'gemini';
        else if (model.startsWith('claude')) service = 'claude';
        else if (model.startsWith('gpt')) service = 'openai';
        else return res.status(400).json({ msg: 'Modelo de IA inválido.' });

        const userKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, service]);
        if (!userKeyData) return res.status(400).json({ msg: `Nenhuma Chave de API do ${service} configurada.` });
        
        const decryptedKey = decrypt(userKeyData.api_key);
        if (!decryptedKey) return res.status(500).json({ msg: 'Falha ao desencriptar a sua chave de API.' });

        let apiCallFunction;
        if (service === 'gemini') apiCallFunction = callGeminiAPI;
        else if (service === 'claude') apiCallFunction = callClaudeAPI;
        else apiCallFunction = callOpenAIAPI;

        const response = await apiCallFunction(prompt, decryptedKey, model);
        const recommendation = parseAIResponse(response.titles, service);

        res.status(200).json({ recommendation: recommendation.text || recommendation });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/niche/find-subniche]:', err);
        res.status(500).json({ msg: err.message || 'Erro interno do servidor.' });
    }
});

app.post('/api/niche/analyze-competitor', authenticateToken, async (req, res) => {
    const { competitorUrl, model } = req.body;
    const userId = req.user.id;

    if (!competitorUrl || !model) {
        return res.status(400).json({ msg: 'URL do canal e modelo de IA são obrigatórios.' });
    }

    try {
        // 1. Obter chaves de API
        const geminiKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, 'gemini']);
        if (!geminiKeyData) return res.status(400).json({ msg: 'Chave de API do Gemini é necessária para buscar dados do YouTube.' });
        const geminiApiKey = decrypt(geminiKeyData.api_key);
        if (!geminiApiKey) return res.status(500).json({ msg: 'Falha ao desencriptar a chave do Gemini.' });

        // 2. Obter ID do canal a partir da URL
        const match = competitorUrl.match(/youtube\.com\/(?:@([\w.-]+)|channel\/([\w-]+))/);
        if (!match) return res.status(400).json({ msg: 'Formato de URL do canal não suportado.' });
        
        let ytChannelId;
        const handle = match[1];
        const legacyId = match[2];

        if (handle) {
            const searchApiUrl = `https://www.googleapis.com/youtube/v3/search?part=id&q=${handle}&type=channel&maxResults=1&key=${geminiApiKey}`;
            const searchResponse = await fetch(searchApiUrl);
            const searchData = await searchResponse.json();
            if (!searchResponse.ok || !searchData.items || searchData.items.length === 0) {
                throw new Error(`Não foi possível encontrar o canal para o handle: @${handle}.`);
            }
            ytChannelId = searchData.items[0].id.channelId;
        } else {
            ytChannelId = legacyId;
        }
        if (!ytChannelId) throw new Error('Não foi possível determinar o ID do canal.');

        // 3. Buscar vídeos do canal
        const [popularVideos, latestVideos] = await Promise.all([
            getChannelVideosWithDetails(ytChannelId, geminiApiKey, 'viewCount', 10),
            getChannelVideosWithDetails(ytChannelId, geminiApiKey, 'date', 10)
        ]);

        let videoDataForPrompt = "Lista de vídeos publicados pelo canal:\n\n";
        videoDataForPrompt += "--- VÍDEOS MAIS POPULARES ---\n";
        popularVideos.forEach(v => {
            videoDataForPrompt += `- Título: "${v.title}", Visualizações: ${v.views}, Publicado há: ${v.days} dias\n`;
        });
        videoDataForPrompt += "\n--- VÍDEOS MAIS RECENTES ---\n";
        latestVideos.forEach(v => {
            videoDataForPrompt += `- Título: "${v.title}", Visualizações: ${v.views}, Publicado há: ${v.days} dias\n`;
        });

        // 4. Construir o PROMPT 2 (OTIMIZADO PARA CRIAR CANAIS MILIONÁRIOS)
        const prompt = `
            Você é um ESPECIALISTA EM CRIAÇÃO DE CANAIS MILIONÁRIOS NO YOUTUBE com experiência em analisar canais de sucesso e criar estratégias vencedoras.
            
            OBJETIVO: Analisar um canal de sucesso no YouTube e usar essa análise como base para criar um canal MILIONÁRIO com MILHÕES DE VIEWS e ALTO CTR dentro do mesmo nicho.
            
            PROMPT 2 - ANÁLISE DE CANAL COMPETIDOR:
            Preciso da sua ajuda para analisar um canal de sucesso no YouTube e usar essa análise como base para a criação do meu próprio canal dentro do mesmo nicho.
            
            Vou te fornecer as seguintes informações:
            ${videoDataForPrompt}
            
            Com base nesses dados, preciso que você faça uma ANÁLISE PROFUNDA E ESTRATÉGICA e me responda com:
            
            1. **Análise de Nicho e Subnicho:**
               - Qual é o nicho exato desse canal e seu subnicho (se houver)?
               - Por que esse nicho/subnicho funcionou tão bem?
               - Há oportunidades de subnichos pouco explorados com alto potencial de viralização?
            
            2. **Diferenciais de Sucesso:**
               - Quais são os principais diferenciais que tornam esse canal bem-sucedido?
               - O que faz esse canal gerar milhões de views?
               - Quais são os elementos únicos que criam alta taxa de engajamento?
            
            3. **Público-Alvo:**
               - Qual é o público-alvo (perfil demográfico, interesses, comportamento)?
               - Que tipo de conteúdo esse público consome?
               - Quais são as necessidades e desejos não atendidos desse público?
            
            4. **Estratégias de Conteúdo Virais:**
               - Quais estratégias de conteúdo parecem ser as mais eficazes (tipo de vídeo, frequência, estilo de narrativa, títulos, miniaturas, SEO)?
               - Quais padrões ou formatos se repetem nos vídeos de maior sucesso?
               - O que faz os vídeos terem alto CTR e gerarem milhões de views?
               - Quais são as fórmulas de títulos e thumbnails que funcionaram?
            
            5. **Análise de Oportunidades:**
               - Há algo nos comentários que revele desejos ou insatisfações da audiência que eu possa usar como oportunidade? (Simule uma análise de sentimentos com base nos títulos e views)
               - Quais são as oportunidades que eu posso explorar para criar um canal similar, porém com diferenciais competitivos?
               - Como posso criar conteúdo que viralize e gere milhões de views?
            
            6. **Orientação Estratégica para Criar Canal Milionário:**
               - Como devo estruturar o conteúdo do meu canal para gerar milhões de views?
               - Qual linha editorial devo seguir para alto CTR e viralização?
               - Sugestões de nome de canal, temas iniciais e identidade visual que atraiam milhões de views
               - Ideias de roteiros para os primeiros vídeos, baseados no que mais funciona no canal analisado
               - Estratégias para criar títulos e thumbnails que gerem alto CTR (acima de 25%)
               - Como criar conteúdo que viralize e gere engajamento massivo
            
            FOCO: Criar um canal MILIONÁRIO com MILHÕES DE VIEWS, ALTO CTR (acima de 25%), e conteúdo que VIRALIZE.
            
            Analise tudo com atenção e me dê uma resposta estratégica e prática, voltada para resultados e criação de canais milionários, em formato JSON. O JSON deve ter chaves como "analise_nicho", "diferenciais_sucesso", "publico_alvo", "estrategias_conteudo", "padroes_videos", "analise_comentarios", "oportunidades_explorar", e "orientacoes_finais" (que por sua vez contém "estrutura_conteudo", "linha_editorial", "sugestoes_branding", "ideias_roteiros", "estrategias_viralizacao", "titulos_ctr_alto", "thumbnails_virais").
        `;

        // 5. Chamar a IA
        let service;
        if (model.startsWith('gemini')) service = 'gemini';
        else if (model.startsWith('claude')) service = 'claude';
        else if (model.startsWith('gpt')) service = 'openai';
        else return res.status(400).json({ msg: 'Modelo de IA inválido.' });

        const userKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, service]);
        if (!userKeyData) return res.status(400).json({ msg: `Nenhuma Chave de API do ${service} configurada.` });
        
        const decryptedKey = decrypt(userKeyData.api_key);
        if (!decryptedKey) return res.status(500).json({ msg: 'Falha ao desencriptar a sua chave de API.' });

        let apiCallFunction;
        if (service === 'gemini') apiCallFunction = callGeminiAPI;
        else if (service === 'claude') apiCallFunction = callClaudeAPI;
        else apiCallFunction = callOpenAIAPI;

        const response = await apiCallFunction(prompt, decryptedKey, model);
        const analysis = parseAIResponse(response.titles, service);

        res.status(200).json(analysis);

    } catch (err) {
        console.error('[ERRO NA ROTA /api/niche/analyze-competitor]:', err);
        res.status(500).json({ msg: err.message || 'Erro interno do servidor.' });
    }
});


// === ROTAS DE ADMIN ===

app.get('/api/admin/stats', authenticateToken, isAdmin, async (req, res) => {
    try {
        const totalUsers = await db.get('SELECT COUNT(*) as count FROM users');
        const pendingUsers = await db.get('SELECT COUNT(*) as count FROM users WHERE isApproved = 0');
        const onlineUsers = await db.get("SELECT COUNT(*) as count FROM users WHERE last_login_at > datetime('now', '-15 minutes')");
        const logins24h = await db.get("SELECT COUNT(*) as count FROM users WHERE last_login_at > datetime('now', '-24 hours')");

        res.json({
            totalUsers: totalUsers.count,
            pendingUsers: pendingUsers.count,
            onlineUsers: onlineUsers.count,
            logins24h: logins24h.count
        });
    } catch (err) {
        console.error('Erro ao buscar estatísticas admin:', err);
        res.status(500).json({ msg: 'Erro ao buscar estatísticas.' });
    }
});

app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    const { search, status } = req.query;
    try {
        let query = 'SELECT id, name, email, whatsapp, isAdmin, isBlocked, isApproved, created_at FROM users';
        const params = [];
        const conditions = [];

        if (search) {
            conditions.push('(email LIKE ? OR whatsapp LIKE ? OR name LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (status) {
            if (status === 'pending') conditions.push('isApproved = 0');
            if (status === 'active') conditions.push('isApproved = 1 AND isBlocked = 0');
            if (status === 'blocked') conditions.push('isBlocked = 1');
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        const users = await db.all(query, params);
        res.json(users);
    } catch (err) {
        console.error('Erro ao buscar utilizadores admin:', err);
        res.status(500).json({ msg: 'Erro no servidor.' });
    }
});

app.post('/api/admin/users/approve-all', authenticateToken, isAdmin, async (req, res) => {
    try {
        await db.run('UPDATE users SET isApproved = 1 WHERE isApproved = 0');
        res.status(200).json({ msg: 'Todos os utilizadores pendentes foram aprovados.' });
    } catch (err) {
        console.error('Erro ao aprovar todos os utilizadores:', err);
        res.status(500).json({ msg: 'Erro ao aprovar utilizadores.' });
    }
});

app.put('/api/admin/users/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, whatsapp, isAdmin, isBlocked, isApproved } = req.body;
    try {
        await db.run('UPDATE users SET name = ?, whatsapp = ?, isAdmin = ?, isBlocked = ?, isApproved = ? WHERE id = ?', [name, whatsapp, isAdmin, isBlocked, isApproved, id]);
        res.status(200).json({ msg: 'Utilizador atualizado com sucesso.' });
    } catch (err) {
        res.status(500).json({ msg: 'Erro ao atualizar utilizador.' });
    }
});

app.put('/api/admin/users/:id/password', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
        return res.status(400).json({ msg: 'A senha deve ter pelo menos 6 caracteres.' });
    }
    try {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, id]);
        res.status(200).json({ msg: 'Senha atualizada com sucesso.' });
    } catch (err) {
        res.status(500).json({ msg: 'Erro ao atualizar a senha.' });
    }
});

app.put('/api/admin/users/:id/status', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { isBlocked } = req.body;
    try {
        await db.run('UPDATE users SET isBlocked = ? WHERE id = ?', [isBlocked, id]);
        res.status(200).json({ msg: `Utilizador ${isBlocked ? 'bloqueado' : 'desbloqueado'} com sucesso.` });
    } catch (err) {
        res.status(500).json({ msg: 'Erro ao alterar o status do utilizador.' });
    }
});

app.delete('/api/admin/users/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    if (parseInt(id, 10) === req.user.id) {
        return res.status(400).json({ msg: 'Não pode excluir a sua própria conta de administrador.' });
    }
    try {
        await db.run('DELETE FROM users WHERE id = ?', [id]);
        res.status(200).json({ msg: 'Utilizador excluído com sucesso.' });
    } catch (err) {
        res.status(500).json({ msg: 'Erro ao excluir utilizador.' });
    }
});


// === ROTAS DE PASTAS E HISTÓRICO ===

app.post('/api/folders', authenticateToken, async (req, res) => {
    const { name } = req.body;
    const userId = req.user.id;

    if (!name) {
        return res.status(400).json({ msg: 'O nome da pasta é obrigatório.' });
    }
    try {
        const result = await db.run(
            'INSERT INTO analysis_folders (user_id, name) VALUES (?, ?)',
            [userId, name]
        );
        res.status(201).json({ id: result.lastID, name });
    } catch (err) {
        console.error('Erro ao criar pasta:', err);
        res.status(500).json({ msg: 'Erro no servidor ao criar pasta.' });
    }
});

app.get('/api/folders', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const folders = await db.all('SELECT id, name FROM analysis_folders WHERE user_id = ? ORDER BY name', [userId]);
        res.status(200).json(folders);
    } catch (err) {
        console.error('Erro ao listar pastas:', err);
        res.status(500).json({ msg: 'Erro no servidor ao listar pastas.' });
    }
});

app.delete('/api/folders/:folderId', authenticateToken, async (req, res) => {
    const { folderId } = req.params;
    const userId = req.user.id;
    try {
        const result = await db.run(
            'DELETE FROM analysis_folders WHERE id = ? AND user_id = ?',
            [folderId, userId]
        );
        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Pasta não encontrada ou não pertence a este utilizador.' });
        }
        res.status(200).json({ msg: 'Pasta excluída com sucesso. As análises foram movidas para o Histórico Geral.' });
    } catch (err) {
        console.error('Erro ao excluir pasta:', err);
        res.status(500).json({ msg: 'Erro no servidor ao excluir pasta.' });
    }
});
app.get('/api/history', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { folderId, page = 1, limit = 50 } = req.query;
    
    try {
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 50;
        const offset = (pageNum - 1) * limitNum;
        
        let query;
        let countQuery;
        let params;
        let countParams;
        
        if (folderId) {
            query = 'SELECT id, original_title, detected_subniche, analyzed_at FROM analyzed_videos WHERE user_id = ? AND folder_id = ? ORDER BY analyzed_at DESC LIMIT ? OFFSET ?';
            params = [userId, folderId, limitNum, offset];
            countQuery = 'SELECT COUNT(*) as total FROM analyzed_videos WHERE user_id = ? AND folder_id = ?';
            countParams = [userId, folderId];
        } else {
            query = 'SELECT id, original_title, detected_subniche, analyzed_at FROM analyzed_videos WHERE user_id = ? AND folder_id IS NULL ORDER BY analyzed_at DESC LIMIT ? OFFSET ?';
            params = [userId, limitNum, offset];
            countQuery = 'SELECT COUNT(*) as total FROM analyzed_videos WHERE user_id = ? AND folder_id IS NULL';
            countParams = [userId];
        }
        
        const [history, totalResult] = await Promise.all([
            db.all(query, params),
            db.get(countQuery, countParams)
        ]);
        
        // Garantir que history é sempre um array
        const historyArray = Array.isArray(history) ? history : [];
        
        const total = totalResult?.total || 0;
        const totalPages = Math.ceil(total / limitNum);
        
        res.status(200).json({
            data: historyArray,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: total,
                totalPages: totalPages,
                hasNext: pageNum < totalPages,
                hasPrev: pageNum > 1
            }
        });
        
    } catch (err) {
        console.error('Erro ao listar histórico:', err);
        res.status(500).json({ msg: 'Erro no servidor ao listar histórico.' });
    }
});

app.delete('/api/history', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ msg: 'Nenhum ID de análise fornecido.' });
    }

    try {
        const placeholders = ids.map(() => '?').join(',');
        const result = await db.run(
            `DELETE FROM analyzed_videos WHERE id IN (${placeholders}) AND user_id = ?`,
            [...ids, userId]
        );
        
        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Nenhuma análise encontrada ou não pertence a este utilizador.' });
        }
        
        res.status(200).json({ msg: `${result.changes} análise(s) excluída(s) com sucesso.` });
        
    } catch (err) {
        console.error('Erro ao excluir análises:', err);
        res.status(500).json({ msg: 'Erro no servidor ao excluir análises.' });
    }
});

app.get('/api/history/load/:analysisId', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { analysisId } = req.params;

    try {
        const analysis = await db.get(
            'SELECT * FROM analyzed_videos WHERE id = ? AND user_id = ?',
            [analysisId, userId]
        );
        if (!analysis) return res.status(404).json({ msg: 'Análise não encontrada.' });

        const titles = await db.all(
            'SELECT id, title_text as titulo, model_used as model, pontuacao, explicacao, is_checked FROM generated_titles WHERE video_analysis_id = ?',
            [analysisId]
        );

        // Calcular receita e RPM baseado no nicho
        const rpm = getRPMByNiche(analysis.detected_niche);
        const views = parseInt(analysis.original_views) || 0;
        const estimatedRevenueUSD = (views / 1000) * rpm.usd;
        const estimatedRevenueBRL = (views / 1000) * rpm.brl;

        const responseData = {
            niche: analysis.detected_niche,
            subniche: analysis.detected_subniche,
            analiseOriginal: JSON.parse(analysis.analysis_data_json || '{}'),
            titulosSugeridos: titles,
            modelUsed: titles.length > 0 ? titles[0].model : 'Carregado',
            videoDetails: {
                title: analysis.original_title,
                translatedTitle: analysis.translated_title || null,
                views: views,
                comments: analysis.original_comments,
                days: analysis.original_days,
                thumbnailUrl: analysis.original_thumbnail_url,
                videoId: analysis.youtube_video_id,
                estimatedRevenueUSD: estimatedRevenueUSD,
                estimatedRevenueBRL: estimatedRevenueBRL,
                rpmUSD: rpm.usd,
                rpmBRL: rpm.brl
            },
            originalVideoUrl: analysis.video_url 
        };
        res.status(200).json(responseData);

    } catch (err) {
        console.error('Erro ao carregar análise:', err);
        res.status(500).json({ msg: 'Erro no servidor ao carregar análise.' });
    }
});


// === ROTAS DE CANAIS MONITORADOS (para análise de canais) ===
app.post('/api/channels/monitor', authenticateToken, async (req, res) => {
    const { channelUrl, channelName } = req.body;
    const userId = req.user.id;

    if (!channelUrl || !channelName) {
        return res.status(400).json({ msg: 'Nome e URL do canal são obrigatórios.' });
    }

    try {
        // Verificar limite de 5 canais por usuário
        const channelCount = await db.get('SELECT COUNT(*) as count FROM monitored_channels WHERE user_id = ?', [userId]);
        if (channelCount && channelCount.count >= 5) {
            return res.status(400).json({ msg: 'Limite de 5 canais monitorados atingido. Exclua um canal antes de adicionar outro.' });
        }

        const result = await db.run(
            'INSERT INTO monitored_channels (user_id, channel_name, channel_url) VALUES (?, ?, ?)',
            [userId, channelName, channelUrl]
        );
        res.status(201).json({ id: result.lastID, channel_name: channelName, channel_url: channelUrl });
    } catch (err) {
        console.error('Erro ao adicionar canal:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ msg: 'Este canal já está sendo monitorado por você.' });
        }
        res.status(500).json({ msg: 'Erro no servidor ao adicionar canal.' });
    }
});

app.get('/api/channels/monitor', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        if (!db) {
            console.error('[Canais Monitorados] Banco de dados não está disponível');
            return res.status(503).json({ msg: 'Banco de dados não está disponível.' });
        }
        
        const channels = await db.all(
            'SELECT id, channel_name, channel_url, last_checked FROM monitored_channels WHERE user_id = ? ORDER BY channel_name',
            [userId]
        );
        
        console.log(`[Canais Monitorados] Encontrados ${channels.length} canais para usuário ${userId}`);
        res.status(200).json(channels || []);
    } catch (err) {
        console.error('[ERRO NA ROTA /api/channels/monitor]:', err);
        res.status(500).json({ msg: 'Erro no servidor ao listar canais.' });
    }
});

app.delete('/api/channels/monitor/:channelId', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { channelId } = req.params;

    try {
        const result = await db.run(
            'DELETE FROM monitored_channels WHERE id = ? AND user_id = ?',
            [channelId, userId]
        );

        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Canal não encontrado ou não pertence a este utilizador.' });
        }
        
        res.status(200).json({ msg: 'Canal removido com sucesso.' });
    } catch (err) {
        console.error('Erro ao excluir canal:', err);
        res.status(500).json({ msg: 'Erro no servidor ao excluir canal.' });
    }
});

app.get('/api/channels/monitor/:channelId/check', authenticateToken, async (req, res) => {
    const { channelId } = req.params;
    const userId = req.user.id;
    try {
        const channel = await db.get('SELECT channel_url FROM monitored_channels WHERE id = ? AND user_id = ?', [channelId, userId]);
        if (!channel) {
            return res.status(404).json({ msg: 'Canal não encontrado.' });
        }

        const geminiKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, 'gemini']);
        if (!geminiKeyData) {
            return res.status(400).json({ msg: 'Chave de API do Gemini é necessária para esta função.' });
        }
        const geminiApiKey = decrypt(geminiKeyData.api_key);
        if (!geminiApiKey) {
            return res.status(500).json({ msg: 'Falha ao desencriptar a chave do Gemini.' });
        }

        // Extrair ID do canal da URL (suporta múltiplos formatos)
        let ytChannelId = null;
        let channelUrl = channel.channel_url;
        
        // Se for URL de vídeo, extrair o canal do vídeo
        const videoMatch = channelUrl.match(/youtube\.com\/watch\?v=([\w-]+)/);
        if (videoMatch) {
            try {
                const videoId = videoMatch[1];
                const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${geminiApiKey}`;
                const videoResponse = await fetch(videoUrl);
                const videoData = await videoResponse.json();
                if (videoResponse.ok && videoData.items && videoData.items.length > 0) {
                    ytChannelId = videoData.items[0].snippet.channelId;
                    console.log(`[Canais Monitorados] Canal ID extraído do vídeo: ${ytChannelId}`);
                }
            } catch (videoErr) {
                console.error('[Canais Monitorados] Erro ao extrair canal do vídeo:', videoErr);
            }
        }
        
        // Se não encontrou via vídeo, tentar formatos de canal
        if (!ytChannelId) {
            const match = channelUrl.match(/youtube\.com\/(?:@([\w.-]+)|channel\/([\w-]+)|c\/([\w-]+)|user\/([\w-]+)|(?:embed\/)?([\w-]{24}))/);
            if (match) {
                const handle = match[1];
                const legacyId = match[2] || match[3] || match[4] || match[5];

                if (handle) {
                    try {
                        // Tentar buscar via channels.list primeiro (mais preciso)
                        const channelsApiUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${geminiApiKey}`;
                        const channelsResponse = await fetch(channelsApiUrl);
                        const channelsData = await channelsResponse.json();
                        
                        if (channelsResponse.ok && channelsData.items && channelsData.items.length > 0) {
                            ytChannelId = channelsData.items[0].id;
                            console.log(`[Canais Monitorados] Canal ID encontrado via channels.list: ${ytChannelId}`);
                        } else {
                            // Fallback: usar search
                            const searchApiUrl = `https://www.googleapis.com/youtube/v3/search?part=id&q=${encodeURIComponent(handle)}&type=channel&maxResults=1&key=${geminiApiKey}`;
                            const searchResponse = await fetch(searchApiUrl);
                            const searchData = await searchResponse.json();

                            if (searchResponse.ok && searchData.items && searchData.items.length > 0) {
                                ytChannelId = searchData.items[0].id.channelId;
                                console.log(`[Canais Monitorados] Canal ID encontrado via search: ${ytChannelId}`);
                            }
                        }
                    } catch (searchErr) {
                        console.error(`[Canais Monitorados] Erro ao buscar canal por handle:`, searchErr);
                    }
                } else if (legacyId) {
                    // Tentar validar se é um ID de canal válido
                    if (legacyId.length >= 24) {
                        // Verificar se é um ID válido fazendo uma busca
                        try {
                            const validateUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&id=${legacyId}&key=${geminiApiKey}`;
                            const validateResponse = await fetch(validateUrl);
                            const validateData = await validateResponse.json();
                            
                            if (validateResponse.ok && validateData.items && validateData.items.length > 0) {
                                ytChannelId = legacyId;
                                console.log(`[Canais Monitorados] ID de canal validado: ${ytChannelId}`);
                            }
                        } catch (validateErr) {
                            console.error(`[Canais Monitorados] Erro ao validar ID:`, validateErr);
                        }
                    }
                }
            }
        }

        if (!ytChannelId) {
            return res.status(400).json({ msg: 'Não foi possível determinar o ID do canal. Verifique se a URL está correta. Formatos suportados: @handle, /channel/ID, /c/ID, /user/ID, ou URL de vídeo.' });
        }

        // Fetch latest, popular, and pinned videos com tratamento de erro robusto
        let latestVideos = [];
        let popularVideos = [];
        let pinnedVideoIds = [];
        
        try {
            const results = await Promise.allSettled([
                getChannelVideosWithDetails(ytChannelId, geminiApiKey, 'date', 5).catch(err => {
                    console.error('[Canais Monitorados] Erro ao buscar vídeos recentes:', err);
                    return [];
                }),
                getChannelVideosWithDetails(ytChannelId, geminiApiKey, 'viewCount', 5).catch(err => {
                    console.error('[Canais Monitorados] Erro ao buscar vídeos populares:', err);
                    return [];
                }),
                db.all('SELECT id, youtube_video_id FROM pinned_videos WHERE user_id = ? AND monitored_channel_id = ? ORDER BY pinned_at DESC', [userId, channelId]).catch(err => {
                    console.error('[Canais Monitorados] Erro ao buscar vídeos fixados:', err);
                    return [];
                })
            ]);
            
            if (results[0].status === 'fulfilled') latestVideos = Array.isArray(results[0].value) ? results[0].value : [];
            if (results[1].status === 'fulfilled') popularVideos = Array.isArray(results[1].value) ? results[1].value : [];
            if (results[2].status === 'fulfilled') pinnedVideoIds = Array.isArray(results[2].value) ? results[2].value : [];
        } catch (fetchErr) {
            console.error('[Canais Monitorados] Erro ao buscar vídeos:', fetchErr);
            // Continuar com arrays vazios
        }

        let pinnedVideos = [];
        if (pinnedVideoIds.length > 0) {
            try {
                const idsToFetch = pinnedVideoIds.map(p => p.youtube_video_id).filter(id => id).join(',');
                if (!idsToFetch) {
                    console.warn('[Canais Monitorados] Nenhum ID válido para vídeos fixados');
                } else {
                    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${idsToFetch}&key=${geminiApiKey}`;
                    const detailsResponse = await fetch(detailsUrl);
                    
                    if (!detailsResponse.ok) {
                        const errorText = await detailsResponse.text();
                        console.error('[Canais Monitorados] Erro ao buscar vídeos fixados:', detailsResponse.status, errorText.substring(0, 200));
                    } else {
                        const detailsData = await detailsResponse.json();
                        if (detailsData.items && Array.isArray(detailsData.items)) {
                            // Calcular receita e RPM para vídeos fixados
                            pinnedVideos = detailsData.items.map(item => {
                                const pinData = pinnedVideoIds.find(p => p.youtube_video_id === item.id);
                                const views = parseInt(item.statistics.viewCount || 0);
                                // Buscar nicho do canal para calcular RPM correto
                                // Por enquanto usar padrão, pode ser melhorado buscando do user_channels
                                const rpm = getRPMByNiche(null);
                                const estimatedRevenueUSD = (views / 1000) * rpm.usd;
                                const estimatedRevenueBRL = (views / 1000) * rpm.brl;
                                
                                return {
                                    pinId: pinData.id,
                                    videoId: item.id,
                                    title: item.snippet.title,
                                    thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url || '',
                                    views: views,
                                    likes: parseInt(item.statistics.likeCount || 0),
                                    comments: parseInt(item.statistics.commentCount || 0),
                                    estimatedRevenueUSD: estimatedRevenueUSD,
                                    estimatedRevenueBRL: estimatedRevenueBRL,
                                    rpmUSD: rpm.usd,
                                    rpmBRL: rpm.brl
                                };
                            });
                        }
                    }
                }
            } catch (pinnedErr) {
                console.error('[Canais Monitorados] Erro ao processar vídeos fixados:', pinnedErr);
                // Continuar com array vazio
            }
        }
        
        try {
            await db.run('UPDATE monitored_channels SET last_checked = CURRENT_TIMESTAMP WHERE id = ?', [channelId]);
        } catch (updateErr) {
            console.warn('[Canais Monitorados] Erro ao atualizar last_checked:', updateErr);
            // Não bloquear a resposta por causa disso
        }
        
        res.status(200).json({
            latest: Array.isArray(latestVideos) ? latestVideos : [],
            popular: Array.isArray(popularVideos) ? popularVideos : [],
            pinned: Array.isArray(pinnedVideos) ? pinnedVideos : []
        });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/channels/monitor/:channelId/check]:', err);
        // Sempre retornar JSON, nunca HTML
        res.status(500).json({ msg: err.message || 'Erro ao buscar vídeos do canal.' });
    }
});

app.get('/api/channels/:channelId/pinned', authenticateToken, async (req, res) => {
    const { channelId } = req.params;
    const userId = req.user.id;
    try {
        const geminiKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, 'gemini']);
        if (!geminiKeyData) return res.status(400).json({ msg: 'Chave de API do Gemini é necessária.' });
        const geminiApiKey = decrypt(geminiKeyData.api_key);
        if (!geminiApiKey) return res.status(500).json({ msg: 'Falha ao desencriptar a chave do Gemini.' });

        const pinnedVideoIds = await db.all('SELECT id, youtube_video_id FROM pinned_videos WHERE user_id = ? AND monitored_channel_id = ? ORDER BY pinned_at DESC', [userId, channelId]);
        
        if (pinnedVideoIds.length === 0) {
            return res.json([]);
        }

        const idsToFetch = pinnedVideoIds.map(p => p.youtube_video_id).join(',');
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${idsToFetch}&key=${geminiApiKey}`;
        const detailsResponse = await fetch(detailsUrl);
        const detailsData = await detailsResponse.json();
        
        let pinnedVideos = [];
        if (detailsResponse.ok && detailsData.items) {
            pinnedVideos = detailsData.items.map(item => {
                const pinData = pinnedVideoIds.find(p => p.youtube_video_id === item.id);
                return {
                    pinId: pinData.id,
                    videoId: item.id,
                    title: item.snippet.title,
                    thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url,
                    views: item.statistics.viewCount || 0,
                    likes: item.statistics.likeCount || 0,
                    comments: item.statistics.commentCount || 0,
                };
            });
        }
        res.status(200).json(pinnedVideos);

    } catch (err) {
        console.error('Erro ao buscar vídeos fixados do canal:', err);
        res.status(500).json({ msg: err.message });
    }
});


// === ROTAS DE VÍDEOS (PIN) ===
app.post('/api/videos/pin', authenticateToken, async (req, res) => {
    const { videoId, title, thumbnail, channelId } = req.body;
    const userId = req.user.id;

    if (!videoId || !title || !thumbnail || !channelId) {
        return res.status(400).json({ msg: 'Dados do vídeo e do canal insuficientes.' });
    }

    try {
        const count = await db.get('SELECT COUNT(*) as count FROM pinned_videos WHERE user_id = ? AND monitored_channel_id = ?', [userId, channelId]);
        if (count.count >= 6) {
            return res.status(400).json({ msg: 'Limite de 6 vídeos fixados por canal atingido.' });
        }

        await db.run(
            'INSERT INTO pinned_videos (user_id, monitored_channel_id, youtube_video_id, title, thumbnail_url) VALUES (?, ?, ?, ?, ?)',
            [userId, channelId, videoId, title, thumbnail]
        );
        res.status(201).json({ msg: 'Vídeo fixado com sucesso.' });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ msg: 'Este vídeo já foi fixado neste canal.' });
        }
        console.error("Erro ao fixar vídeo:", err);
        res.status(500).json({ msg: 'Erro no servidor ao fixar vídeo.' });
    }
});

app.delete('/api/videos/unpin/:pinId', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { pinId } = req.params;
    try {
        const result = await db.run(
            'DELETE FROM pinned_videos WHERE id = ? AND user_id = ?',
            [pinId, userId]
        );
        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Vídeo fixado não encontrado ou não pertence a este utilizador.' });
        }
        res.status(200).json({ msg: 'Vídeo removido dos fixados.' });
    } catch (err) {
        console.error("Erro ao remover vídeo fixado:", err);
        res.status(500).json({ msg: 'Erro no servidor ao remover vídeo fixado.' });
    }
});
// === ROTAS DE ANALYTICS E TRACKING ===

// Registrar tracking de vídeo publicado
app.post('/api/analytics/track', authenticateToken, async (req, res) => {
    const { analysisId, youtubeVideoId, titleUsed, thumbnailUsed, predictedCtr, predictedViews, publishedAt } = req.body;
    const userId = req.user.id;

    if (!youtubeVideoId || !titleUsed) {
        return res.status(400).json({ msg: 'YouTube Video ID e título são obrigatórios.' });
    }

    try {
        const result = await db.run(
            `INSERT INTO video_tracking (user_id, analysis_id, youtube_video_id, title_used, thumbnail_used, predicted_ctr, predicted_views, published_at, channel_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, analysisId || null, youtubeVideoId, titleUsed, thumbnailUsed || null, predictedCtr || null, predictedViews || null, publishedAt || new Date().toISOString(), req.body.channelId || null]
        );
        res.status(201).json({ id: result.lastID, msg: 'Tracking iniciado com sucesso.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/analytics/track]:', err);
        res.status(500).json({ msg: 'Erro ao registrar tracking.' });
    }
});

// Função helper para obter RPM baseado no nicho (usada em múltiplas rotas)
// Função para analisar canal e detectar nicho/subnicho automaticamente
async function analyzeChannelNiche(channelId, channelName, accessToken, userId) {
    try {
        console.log(`[Análise Canal] Analisando canal ${channelId} (${channelName})...`);
        
        // Buscar os 5 vídeos mais recentes do canal (reduzido para ser mais rápido)
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=date&maxResults=5&type=video`;
        const searchResponse = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (!searchResponse.ok) {
            console.warn(`[Análise Canal] Erro ao buscar vídeos do canal ${channelId}`);
            return { niche: null, subniche: null };
        }
        
        const searchData = await searchResponse.json();
        if (!searchData.items || searchData.items.length === 0) {
            console.warn(`[Análise Canal] Nenhum vídeo encontrado no canal ${channelId}`);
            return { niche: null, subniche: null };
        }
        
        // Extrair títulos dos vídeos
        const videoTitles = searchData.items
            .map(item => item.snippet?.title || '')
            .filter(title => title.length > 0)
            .slice(0, 5); // Limitar a 5 títulos para análise mais rápida
        
        if (videoTitles.length === 0) {
            return { niche: null, subniche: null };
        }
        
        // Buscar chaves de API do usuário para análise
        const keysData = await db.all('SELECT service_name, api_key FROM user_api_keys WHERE user_id = ?', [userId]);
        const keys = {};
        keysData.forEach(k => { keys[k.service_name] = decrypt(k.api_key); });
        
        // Tentar usar Gemini, Claude ou OpenAI (nesta ordem)
        let detectedNiche = null;
        let detectedSubniche = null;
        
        const analysisPrompt = `Você é um especialista em análise de conteúdo do YouTube. Analise os seguintes títulos de vídeos de um canal do YouTube e identifique o NICHO e SUBNICHE do canal.

Títulos dos vídeos:
${videoTitles.map((title, i) => `${i + 1}. ${title}`).join('\n')}

Nome do canal: ${channelName}

Analise os padrões, temas e assuntos recorrentes nos títulos para identificar:
- O NICHO principal (categoria ampla: Entretenimento, Educação, Tecnologia, Finanças, Gaming, etc.)
- O SUBNICHE específico (área mais específica dentro do nicho: Gaming FPS, Finanças Pessoais, Programação Web, etc.)

IMPORTANTE: Responda APENAS com um objeto JSON válido, sem nenhum texto adicional antes ou depois:
{
  "niche": "Nome do nicho principal",
  "subniche": "Nome do subnicho específico ou null se não houver subnicho claro"
}

Seja específico e preciso. Se não conseguir identificar claramente, use "Entretenimento" como nicho padrão e deixe subniche como null.`;

        // Tentar Gemini primeiro
        if (keys.gemini) {
            try {
                const response = await callGeminiAPI(analysisPrompt, keys.gemini, 'gemini-2.0-flash');
                const parsed = parseAIResponse(response.titles, 'gemini');
                if (parsed.niche) {
                    detectedNiche = parsed.niche;
                    detectedSubniche = parsed.subniche || null;
                    console.log(`[Análise Canal] Nicho detectado via Gemini: ${detectedNiche} / ${detectedSubniche}`);
                    return { niche: detectedNiche, subniche: detectedSubniche };
                }
            } catch (err) {
                console.warn(`[Análise Canal] Erro ao usar Gemini: ${err.message}`);
            }
        }
        
        // Tentar Claude
        if (keys.claude) {
            try {
                const response = await callClaudeAPI(analysisPrompt, keys.claude, 'claude-3-5-haiku-20241022');
                const parsed = parseAIResponse(response.titles, 'claude');
                if (parsed.niche) {
                    detectedNiche = parsed.niche;
                    detectedSubniche = parsed.subniche || null;
                    console.log(`[Análise Canal] Nicho detectado via Claude: ${detectedNiche} / ${detectedSubniche}`);
                    return { niche: detectedNiche, subniche: detectedSubniche };
                }
            } catch (err) {
                console.warn(`[Análise Canal] Erro ao usar Claude: ${err.message}`);
            }
        }
        
        // Tentar OpenAI
        if (keys.openai) {
            try {
                const response = await callOpenAIAPI(analysisPrompt, keys.openai, 'gpt-4o-mini');
                const parsed = parseAIResponse(response.titles, 'openai');
                if (parsed.niche) {
                    detectedNiche = parsed.niche;
                    detectedSubniche = parsed.subniche || null;
                    console.log(`[Análise Canal] Nicho detectado via OpenAI: ${detectedNiche} / ${detectedSubniche}`);
                    return { niche: detectedNiche, subniche: detectedSubniche };
                }
            } catch (err) {
                console.warn(`[Análise Canal] Erro ao usar OpenAI: ${err.message}`);
            }
        }
        
        // Se nenhuma IA funcionou, retornar null
        console.warn(`[Análise Canal] Não foi possível detectar nicho para o canal ${channelId}`);
        return { niche: null, subniche: null };
        
    } catch (err) {
        console.error(`[Análise Canal] Erro ao analisar canal ${channelId}:`, err.message);
        return { niche: null, subniche: null };
    }
}

function getRPMByNiche(niche) {
    if (!niche) return { usd: 2.0, brl: 11.0 }; // Padrão: Entretenimento
    
    const nicheLower = niche.toLowerCase();
    
    // RPMs reais por nicho (USD por 1000 views) - baseado em dados do mercado
    const rpmMap = {
        'finança': { usd: 15.0, brl: 82.5 },
        'financeiro': { usd: 15.0, brl: 82.5 },
        'investimento': { usd: 18.0, brl: 99.0 },
        'investimentos': { usd: 18.0, brl: 99.0 },
        'educação financeira': { usd: 12.0, brl: 66.0 },
        'tecnologia': { usd: 7.0, brl: 38.5 },
        'tech': { usd: 7.0, brl: 38.5 },
        'programação': { usd: 8.0, brl: 44.0 },
        'gaming': { usd: 3.5, brl: 19.25 },
        'jogos': { usd: 3.5, brl: 19.25 },
        'game': { usd: 3.5, brl: 19.25 },
        'educação': { usd: 5.0, brl: 27.5 },
        'educacional': { usd: 5.0, brl: 27.5 },
        'culinária': { usd: 3.0, brl: 16.5 },
        'receitas': { usd: 3.0, brl: 16.5 },
        'fitness': { usd: 4.0, brl: 22.0 },
        'saúde': { usd: 4.5, brl: 24.75 },
        'entretenimento': { usd: 2.0, brl: 11.0 },
        'vlogs': { usd: 2.5, brl: 13.75 },
        'viagens': { usd: 4.0, brl: 22.0 },
        'história': { usd: 3.5, brl: 19.25 },
        'ciência': { usd: 5.5, brl: 30.25 },
        'negócios': { usd: 10.0, brl: 55.0 },
        'empreendedorismo': { usd: 9.0, brl: 49.5 },
        'marketing': { usd: 8.0, brl: 44.0 },
        'vendas': { usd: 9.0, brl: 49.5 }
    };
    
    // Buscar nicho correspondente (busca parcial)
    for (const [key, value] of Object.entries(rpmMap)) {
        if (nicheLower.includes(key)) {
            return value;
        }
    }
    
    // Se não encontrar, retornar padrão baseado em palavras-chave
    if (nicheLower.includes('finance') || nicheLower.includes('dinheiro') || nicheLower.includes('invest')) {
        return { usd: 12.0, brl: 66.0 };
    }
    if (nicheLower.includes('tech') || nicheLower.includes('program') || nicheLower.includes('software')) {
        return { usd: 7.0, brl: 38.5 };
    }
    if (nicheLower.includes('game') || nicheLower.includes('jogo')) {
        return { usd: 3.5, brl: 19.25 };
    }
    if (nicheLower.includes('educ') || nicheLower.includes('curso') || nicheLower.includes('aprend')) {
        return { usd: 5.0, brl: 27.5 };
    }
    
    // Padrão: Entretenimento
    return { usd: 2.0, brl: 11.0 };
}

// Atualizar métricas de vídeo (buscar do YouTube)
app.post('/api/analytics/update/:trackingId', authenticateToken, async (req, res) => {
    const { trackingId } = req.params;
    const userId = req.user.id;

    try {
        // Buscar tracking com informações do canal
        const tracking = await db.get(`
            SELECT vt.youtube_video_id, vt.channel_id, uc.niche 
            FROM video_tracking vt
            LEFT JOIN user_channels uc ON vt.channel_id = uc.id
            WHERE vt.id = ? AND vt.user_id = ?
        `, [trackingId, userId]);
        
        if (!tracking) {
            return res.status(404).json({ msg: 'Tracking não encontrado.' });
        }

        const geminiKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, 'gemini']);
        if (!geminiKeyData) {
            return res.status(400).json({ msg: 'Chave de API do Gemini é necessária.' });
        }
        const geminiApiKey = decrypt(geminiKeyData.api_key);

        const videoDetails = await callYouTubeDataAPI(tracking.youtube_video_id, geminiApiKey);
        
        // Calcular CTR estimado (YouTube não fornece CTR diretamente, então estimamos)
        // Usar uma fórmula mais realista baseada nas views
        // Vídeos com muitas views geralmente têm CTR mais baixo, vídeos novos podem ter CTR mais alto
        const views = parseInt(videoDetails.views) || 0;
        let estimatedCtr = 0;
        if (views > 0) {
            // Fórmula mais realista: CTR diminui conforme views aumentam
            // Vídeos com 1K views: ~15% CTR, 10K views: ~10% CTR, 100K views: ~5% CTR, 1M views: ~3% CTR
            if (views < 10000) {
                estimatedCtr = 15 - (views / 10000) * 5; // 15% a 10%
            } else if (views < 100000) {
                estimatedCtr = 10 - ((views - 10000) / 90000) * 5; // 10% a 5%
            } else if (views < 1000000) {
                estimatedCtr = 5 - ((views - 100000) / 900000) * 2; // 5% a 3%
            } else {
                estimatedCtr = Math.max(2, 3 - ((views - 1000000) / 10000000) * 1); // 3% a 2%
            }
            estimatedCtr = Math.max(2, Math.min(30, estimatedCtr)); // Limitar entre 2% e 30%
        }
        
        // Calcular receita baseada no RPM do nicho do canal
        const rpm = getRPMByNiche(tracking.niche);
        const estimatedRevenue = (views / 1000) * rpm.usd;

        await db.run(
            `UPDATE video_tracking 
             SET actual_views = ?, actual_likes = ?, actual_comments = ?, actual_ctr = ?, revenue_estimate = ?, last_updated = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [videoDetails.views, videoDetails.likes, videoDetails.comments, estimatedCtr, estimatedRevenue, trackingId]
        );

        // Criar snapshot
        await db.run(
            `INSERT INTO analytics_snapshots (user_id, video_tracking_id, views, likes, comments, ctr)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, trackingId, videoDetails.views, videoDetails.likes, videoDetails.comments, estimatedCtr]
        );

        res.status(200).json({ 
            views: videoDetails.views,
            likes: videoDetails.likes,
            comments: videoDetails.comments,
            ctr: estimatedCtr,
            revenue: estimatedRevenue
        });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/analytics/update]:', err);
        res.status(500).json({ msg: 'Erro ao atualizar métricas.' });
    }
});

// Obter dashboard de analytics
app.get('/api/analytics/dashboard', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    console.log(`[Analytics Dashboard] Requisição recebida para userId: ${userId}`);

    try {
        if (!db) {
            console.error('[Analytics Dashboard] Banco de dados não está disponível');
            return res.status(503).json({ msg: 'Banco de dados não está disponível.' });
        }

        // Verificar se a tabela existe e tem dados
        let stats = {
            total_videos: 0,
            total_views: 0,
            total_likes: 0,
            total_comments: 0,
            avg_ctr: 0,
            total_revenue: 0,
            viral_videos: 0
        };
        
        try {
            // Verificar se a tabela existe primeiro
            const tableCheck = await db.get(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='video_tracking'
            `);
            
            if (tableCheck) {
                stats = await db.get(`
                    SELECT 
                        COUNT(*) as total_videos,
                        COALESCE(SUM(actual_views), 0) as total_views,
                        COALESCE(SUM(actual_likes), 0) as total_likes,
                        COALESCE(SUM(actual_comments), 0) as total_comments,
                        COALESCE(AVG(actual_ctr), 0) as avg_ctr,
                        COALESCE(SUM(revenue_estimate), 0) as total_revenue,
                        COUNT(CASE WHEN actual_views >= 1000000 THEN 1 END) as viral_videos
                    FROM video_tracking
                    WHERE user_id = ?
                `, [userId]) || stats;
            }
            console.log(`[Analytics Dashboard] Stats encontrados:`, stats);
        } catch (dbErr) {
            console.error('[Analytics Dashboard] Erro ao buscar stats:', dbErr);
            // Manter valores padrão
        }

        let recentVideos = [];
        try {
            // Verificar se a tabela existe primeiro
            const tableCheck = await db.get(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='video_tracking'
            `);
            
            if (tableCheck) {
                recentVideos = await db.all(`
                    SELECT vt.id, vt.youtube_video_id, vt.title_used, vt.actual_views, vt.actual_ctr, vt.revenue_estimate, 
                           vt.published_at, vt.tracked_at, vt.channel_id, uc.channel_name
                    FROM video_tracking vt
                    LEFT JOIN user_channels uc ON vt.channel_id = uc.id
                    WHERE vt.user_id = ?
                    ORDER BY COALESCE(vt.published_at, vt.tracked_at) DESC
                    LIMIT 50
                `, [userId]) || [];
            }
            console.log(`[Analytics Dashboard] Vídeos recentes encontrados:`, recentVideos.length);
        } catch (dbErr) {
            console.error('[Analytics Dashboard] Erro ao buscar vídeos recentes:', dbErr);
            recentVideos = [];
        }

        // Usar a função getRPMByNiche definida globalmente acima
        
        // Calcular RPM por canal (baseado no nicho)
        let totalRPMUSD = 0;
        let totalRPMBRL = 0;
        let channelsCount = 0;
        
        try {
            const channelsWithNiche = await db.all(`
                SELECT DISTINCT uc.niche 
                FROM user_channels uc
                INNER JOIN video_tracking vt ON vt.channel_id = uc.id
                WHERE uc.user_id = ? AND uc.niche IS NOT NULL AND uc.niche != ''
            `, [userId]);
            
            if (channelsWithNiche && channelsWithNiche.length > 0) {
                channelsWithNiche.forEach(ch => {
                    const rpm = getRPMByNiche(ch.niche);
                    totalRPMUSD += rpm.usd;
                    totalRPMBRL += rpm.brl;
                    channelsCount++;
                });
                // Média dos RPMs
                totalRPMUSD = totalRPMUSD / channelsCount;
                totalRPMBRL = totalRPMBRL / channelsCount;
            } else {
                // Se não há canais com nicho, usar padrão
                const defaultRPM = getRPMByNiche(null);
                totalRPMUSD = defaultRPM.usd;
                totalRPMBRL = defaultRPM.brl;
            }
        } catch (rpmErr) {
            console.error('[Analytics] Erro ao calcular RPM por nicho:', rpmErr);
            const defaultRPM = getRPMByNiche(null);
            totalRPMUSD = defaultRPM.usd;
            totalRPMBRL = defaultRPM.brl;
        }
        
        // Calcular receita estimada baseada no RPM real do nicho
        const totalViews = parseInt(stats?.total_views || 0);
        const usdToBrlRate = 5.50;
        
        // Calcular receita total: somar receita do banco + receita estimada baseada no RPM do nicho
        // Se há receita no banco, usar ela; senão, calcular baseado no RPM do nicho
        let totalRevenueUSD = parseFloat(stats?.total_revenue || 0);
        
        // Se não há receita no banco mas há views, calcular baseado no RPM do nicho
        if (totalRevenueUSD === 0 && totalViews > 0 && totalRPMUSD > 0) {
            totalRevenueUSD = (totalViews * totalRPMUSD) / 1000;
        }
        // Se há receita no banco, recalcular baseado no RPM do nicho para atualizar
        else if (totalViews > 0 && totalRPMUSD > 0) {
            // Recalcular receita baseada no RPM atual do nicho (mais preciso)
            totalRevenueUSD = (totalViews * totalRPMUSD) / 1000;
        }
        
        const totalRevenueBRL = totalRevenueUSD * usdToBrlRate;
        
        // RPM final (usar o calculado baseado no nicho, ou calcular a partir da receita se houver)
        let rpmUSD = totalRPMUSD;
        let rpmBRL = totalRPMBRL;
        
        // Se não há RPM calculado mas há receita, calcular RPM a partir da receita
        if (rpmUSD === 0 && totalRevenueUSD > 0 && totalViews > 0) {
            rpmUSD = (totalRevenueUSD / totalViews) * 1000;
            rpmBRL = (totalRevenueBRL / totalViews) * 1000;
        }

        // Garantir que recentVideos é sempre um array
        const recentVideosArray = Array.isArray(recentVideos) ? recentVideos : [];
        
        const response = {
            stats: {
                totalVideos: parseInt(stats?.total_videos || 0),
                totalViews: totalViews,
                totalLikes: parseInt(stats?.total_likes || 0),
                totalComments: parseInt(stats?.total_comments || 0),
                avgCtr: parseFloat(stats?.avg_ctr || 0),
                totalRevenue: totalRevenueUSD,
                totalRevenueBRL: totalRevenueBRL,
                rpmUSD: rpmUSD,
                rpmBRL: rpmBRL,
                viralVideos: parseInt(stats?.viral_videos || 0)
            },
            recentVideos: recentVideosArray
        };

        console.log(`[Analytics Dashboard] Enviando resposta:`, JSON.stringify(response).substring(0, 200));
        res.status(200).json(response);
    } catch (err) {
        console.error('[ERRO NA ROTA /api/analytics/dashboard]:', err);
        // Sempre retornar JSON válido, nunca HTML
        res.status(500).json({ 
            stats: {
                totalVideos: 0,
                totalViews: 0,
                totalLikes: 0,
                totalComments: 0,
                avgCtr: 0,
                totalRevenue: 0,
                totalRevenueBRL: 0,
                rpmUSD: 2.0,
                rpmBRL: 11.0,
                viralVideos: 0
            },
            recentVideos: [],
            error: err.message || 'Erro no servidor ao buscar dados do dashboard.'
        });
    }
});

// Excluir vídeo do tracking
app.delete('/api/analytics/track/:trackingId', authenticateToken, async (req, res) => {
    const { trackingId } = req.params;
    const userId = req.user.id;

    try {
        if (!db) {
            console.error('[Analytics Delete] Banco de dados não está disponível');
            return res.status(503).json({ msg: 'Banco de dados não está disponível.' });
        }

        // Verificar se o tracking pertence ao usuário
        const tracking = await db.get('SELECT id FROM video_tracking WHERE id = ? AND user_id = ?', [trackingId, userId]);
        if (!tracking) {
            return res.status(404).json({ msg: 'Tracking não encontrado ou não pertence a este usuário.' });
        }

        // Excluir snapshots relacionados primeiro (devido à foreign key)
        await db.run('DELETE FROM analytics_snapshots WHERE video_tracking_id = ?', [trackingId]);

        // Excluir o tracking
        const result = await db.run('DELETE FROM video_tracking WHERE id = ? AND user_id = ?', [trackingId, userId]);
        
        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Tracking não encontrado.' });
        }

        console.log(`[Analytics Delete] Vídeo ${trackingId} excluído pelo usuário ${userId}`);
        res.status(200).json({ msg: 'Vídeo excluído do tracking com sucesso.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/analytics/track/:trackingId DELETE]:', err);
        res.status(500).json({ msg: 'Erro ao excluir vídeo do tracking.' });
    }
});
// === NOVAS FUNCIONALIDADES DE ANALYTICS E VALIDAÇÃO ===

// 1. ROI Calculator - Calcular receita total gerada pelos vídeos
app.get('/api/analytics/roi', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    try {
        let query = `
            SELECT 
                COUNT(*) as total_videos,
                SUM(actual_views) as total_views,
                SUM(revenue_estimate) as total_revenue,
                AVG(actual_ctr) as avg_ctr,
                SUM(actual_likes) as total_likes,
                SUM(actual_comments) as total_comments
            FROM video_tracking
            WHERE user_id = ? AND actual_views > 0
        `;
        const params = [userId];

        if (startDate) {
            query += ' AND published_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND published_at <= ?';
            params.push(endDate);
        }

        const stats = await db.get(query, params);

        // Calcular ROI (assumindo que cada análise custa $0.50 ou similar)
        const costPerAnalysis = 0.50;
        const totalCost = (stats.total_videos || 0) * costPerAnalysis;
        const totalRevenue = stats.total_revenue || 0;
        const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;

        res.status(200).json({
            totalVideos: stats.total_videos || 0,
            totalViews: stats.total_views || 0,
            totalRevenue: totalRevenue,
            totalCost: totalCost,
            roi: roi.toFixed(2),
            avgCtr: (stats.avg_ctr || 0).toFixed(2),
            totalLikes: stats.total_likes || 0,
            totalComments: stats.total_comments || 0,
            netProfit: (totalRevenue - totalCost).toFixed(2)
        });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/analytics/roi]:', err);
        res.status(500).json({ msg: 'Erro ao calcular ROI.' });
    }
});

// 2. Leaderboard - Melhores títulos/thumbnails por views
app.get('/api/analytics/leaderboard', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { type = 'all', limit = 10 } = req.query; // type: 'titles', 'thumbnails', 'all'

    try {
        let leaderboard = [];

        if (type === 'titles' || type === 'all') {
            const topTitles = await db.all(`
                SELECT 
                    title_used as item,
                    'title' as type,
                    actual_views as views,
                    actual_ctr as ctr,
                    revenue_estimate as revenue,
                    published_at
                FROM video_tracking
                WHERE user_id = ? AND title_used IS NOT NULL AND actual_views > 0
                ORDER BY actual_views DESC
                LIMIT ?
            `, [userId, parseInt(limit)]);
            leaderboard = leaderboard.concat(topTitles);
        }

        if (type === 'thumbnails' || type === 'all') {
            const topThumbnails = await db.all(`
                SELECT 
                    thumbnail_used as item,
                    'thumbnail' as type,
                    actual_views as views,
                    actual_ctr as ctr,
                    revenue_estimate as revenue,
                    published_at
                FROM video_tracking
                WHERE user_id = ? AND thumbnail_used IS NOT NULL AND actual_views > 0
                ORDER BY actual_views DESC
                LIMIT ?
            `, [userId, parseInt(limit)]);
            leaderboard = leaderboard.concat(topThumbnails);
        }

        // Ordenar por views e limitar
        leaderboard.sort((a, b) => (b.views || 0) - (a.views || 0));
        leaderboard = leaderboard.slice(0, parseInt(limit));

        res.status(200).json({ leaderboard });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/analytics/leaderboard]:', err);
        res.status(500).json({ msg: 'Erro ao buscar leaderboard.' });
    }
});

// 3. Heatmap de Sucesso - Fórmulas de título que funcionam melhor por nicho
app.get('/api/analytics/heatmap', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        // Buscar títulos da biblioteca com suas métricas de sucesso
        // Nota: JOIN pode não funcionar se não houver correspondência exata, então fazemos query separada
        const heatmapData = await db.all(`
            SELECT 
                COALESCE(uc.niche, 'Geral') as niche,
                COALESCE(uc.subniche, '') as subniche,
                COUNT(*) as usage_count,
                AVG(vt.actual_views) as avg_views,
                AVG(vt.actual_ctr) as avg_ctr,
                MAX(vt.actual_views) as max_views
            FROM video_tracking vt
            LEFT JOIN user_channels uc ON vt.channel_id = uc.id
            WHERE vt.user_id = ? AND vt.actual_views > 0
            GROUP BY COALESCE(uc.niche, 'Geral'), COALESCE(uc.subniche, '')
            ORDER BY avg_views DESC
        `, [userId]);

        // Também buscar dados da biblioteca de títulos
        const libraryData = await db.all(`
            SELECT 
                niche,
                subniche,
                formula_type,
                COUNT(*) as count,
                AVG(original_views) as avg_views,
                AVG(original_ctr) as avg_ctr
            FROM viral_titles_library
            WHERE user_id = ? AND original_views > 0
            GROUP BY niche, subniche, formula_type
        `, [userId]);

        res.status(200).json({
            tracking: heatmapData,
            library: libraryData
        });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/analytics/heatmap]:', err);
        res.status(500).json({ msg: 'Erro ao buscar heatmap.' });
    }
});

// 4. Score Predictor - IA prevê potencial de views antes de publicar
app.post('/api/analytics/predict-score', authenticateToken, async (req, res) => {
    const { title, thumbnailDescription, niche, subniche } = req.body;
    const userId = req.user.id;

    if (!title) {
        return res.status(400).json({ msg: 'Título é obrigatório.' });
    }

    try {
        // Buscar histórico de sucesso do usuário
        const userHistory = await db.all(`
            SELECT 
                AVG(actual_views) as avg_views,
                AVG(actual_ctr) as avg_ctr,
                COUNT(*) as total_videos
            FROM video_tracking
            WHERE user_id = ? AND actual_views > 0
        `, [userId]);

        // Buscar títulos similares na biblioteca
        const similarTitles = await db.all(`
            SELECT 
                original_views,
                original_ctr,
                viral_score
            FROM viral_titles_library
            WHERE user_id = ? AND niche = ? AND original_views > 0
            ORDER BY original_views DESC
            LIMIT 10
        `, [userId, niche || '']);

        // Calcular score baseado em múltiplos fatores
        let predictedViews = 0;
        let predictedCtr = 0;
        let score = 0;

        // Fator 1: Histórico do usuário
        if (userHistory[0] && userHistory[0].total_videos > 0) {
            predictedViews = userHistory[0].avg_views || 0;
            predictedCtr = userHistory[0].avg_ctr || 0;
        }

        // Fator 2: Títulos similares
        if (similarTitles.length > 0) {
            const avgSimilarViews = similarTitles.reduce((sum, t) => sum + (t.original_views || 0), 0) / similarTitles.length;
            const avgSimilarCtr = similarTitles.reduce((sum, t) => sum + (t.original_ctr || 0), 0) / similarTitles.length;
            
            // Média ponderada: 60% histórico do usuário, 40% títulos similares
            predictedViews = (predictedViews * 0.6) + (avgSimilarViews * 0.4);
            predictedCtr = (predictedCtr * 0.6) + (avgSimilarCtr * 0.4);
        }

        // Fator 3: Análise do título (comprimento, palavras-chave, etc)
        const titleLength = title.length;
        const hasNumbers = /\d/.test(title);
        const hasQuestion = title.includes('?');
        const hasExclamation = title.includes('!');
        const powerWords = ['SECRETO', 'REVELADO', 'ESCONDIDO', 'PROIBIDO', 'CHOCANTE', 'INCRÍVEL', 'NUNCA VISTO'];
        const hasPowerWords = powerWords.some(word => title.toUpperCase().includes(word));

        // Ajustar score baseado em características do título
        let titleScore = 50; // Base
        if (titleLength >= 40 && titleLength <= 60) titleScore += 10; // Tamanho ideal
        if (hasNumbers) titleScore += 5;
        if (hasQuestion) titleScore += 8;
        if (hasExclamation) titleScore += 5;
        if (hasPowerWords) titleScore += 15;

        // Calcular score final (0-100)
        score = Math.min(100, Math.max(0, titleScore + (predictedCtr * 2)));

        // Ajustar views previstas baseado no score
        predictedViews = predictedViews * (score / 50);

        res.status(200).json({
            predictedViews: Math.round(predictedViews),
            predictedCtr: predictedCtr.toFixed(2),
            score: Math.round(score),
            factors: {
                titleLength,
                hasNumbers,
                hasQuestion,
                hasExclamation,
                hasPowerWords,
                userHistory: userHistory[0] || null,
                similarTitlesCount: similarTitles.length
            }
        });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/analytics/predict-score]:', err);
        res.status(500).json({ msg: 'Erro ao prever score.' });
    }
});

// 5. Validação de Título
app.post('/api/analytics/validate-title', authenticateToken, async (req, res) => {
    const { title, niche } = req.body;

    if (!title) {
        return res.status(400).json({ msg: 'Título é obrigatório.' });
    }

    try {
        const validations = {
            length: {
                value: title.length,
                min: 30,
                max: 70,
                ideal: 40,
                passed: title.length >= 30 && title.length <= 70,
                score: title.length >= 40 && title.length <= 60 ? 100 : title.length >= 30 && title.length <= 70 ? 70 : 50
            },
            hasNumbers: {
                value: /\d/.test(title),
                passed: /\d/.test(title),
                score: /\d/.test(title) ? 100 : 50,
                tip: 'Números aumentam CTR em até 20%'
            },
            hasQuestion: {
                value: title.includes('?'),
                passed: title.includes('?'),
                score: title.includes('?') ? 100 : 60,
                tip: 'Perguntas geram curiosidade'
            },
            hasPowerWords: {
                value: ['SECRETO', 'REVELADO', 'ESCONDIDO', 'PROIBIDO', 'CHOCANTE', 'INCRÍVEL', 'NUNCA VISTO', 'EXCLUSIVO'].some(w => title.toUpperCase().includes(w)),
                passed: ['SECRETO', 'REVELADO', 'ESCONDIDO', 'PROIBIDO', 'CHOCANTE', 'INCRÍVEL', 'NUNCA VISTO', 'EXCLUSIVO'].some(w => title.toUpperCase().includes(w)),
                score: ['SECRETO', 'REVELADO', 'ESCONDIDO', 'PROIBIDO', 'CHOCANTE', 'INCRÍVEL', 'NUNCA VISTO', 'EXCLUSIVO'].some(w => title.toUpperCase().includes(w)) ? 100 : 50,
                tip: 'Palavras poderosas aumentam engajamento'
            },
            capitalization: {
                value: title.split(' ').filter(w => w[0] && w[0] === w[0].toUpperCase()).length,
                passed: title.split(' ').filter(w => w[0] && w[0] === w[0].toUpperCase()).length >= 3,
                score: title.split(' ').filter(w => w[0] && w[0] === w[0].toUpperCase()).length >= 3 ? 100 : 70,
                tip: 'Capitalização adequada melhora legibilidade'
            }
        };

        const totalScore = Object.values(validations).reduce((sum, v) => sum + (v.score || 0), 0) / Object.keys(validations).length;
        const passedCount = Object.values(validations).filter(v => v.passed).length;
        const totalChecks = Object.keys(validations).length;

        res.status(200).json({
            title,
            validations,
            overallScore: Math.round(totalScore),
            passedChecks: `${passedCount}/${totalChecks}`,
            recommendation: totalScore >= 80 ? 'excellent' : totalScore >= 60 ? 'good' : 'needs_improvement',
            tips: Object.values(validations).filter(v => !v.passed && v.tip).map(v => v.tip)
        });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/analytics/validate-title]:', err);
        res.status(500).json({ msg: 'Erro ao validar título.' });
    }
});

// 6. Validação de Thumbnail (análise básica)
app.post('/api/analytics/validate-thumbnail', authenticateToken, async (req, res) => {
    const { thumbnailDescription, niche } = req.body;

    if (!thumbnailDescription) {
        return res.status(400).json({ msg: 'Descrição da thumbnail é obrigatória.' });
    }

    try {
        const validations = {
            hasFace: {
                value: /face|rosto|pessoa|person|human/i.test(thumbnailDescription),
                passed: /face|rosto|pessoa|person|human/i.test(thumbnailDescription),
                score: /face|rosto|pessoa|person|human/i.test(thumbnailDescription) ? 100 : 50,
                tip: 'Rostos humanos aumentam CTR em até 30%'
            },
            hasText: {
                value: /text|texto|phrase|frase|word|palavra/i.test(thumbnailDescription),
                passed: /text|texto|phrase|frase|word|palavra/i.test(thumbnailDescription),
                score: /text|texto|phrase|frase|word|palavra/i.test(thumbnailDescription) ? 100 : 60,
                tip: 'Texto na thumbnail aumenta cliques'
            },
            hasContrast: {
                value: /contrast|contraste|bright|brilhante|vibrant|vibrante|color/i.test(thumbnailDescription),
                passed: /contrast|contraste|bright|brilhante|vibrant|vibrante|color/i.test(thumbnailDescription),
                score: /contrast|contraste|bright|brilhante|vibrant|vibrante|color/i.test(thumbnailDescription) ? 100 : 50,
                tip: 'Alto contraste melhora visibilidade'
            },
            hasEmotion: {
                value: /emotion|emoção|expression|expressão|surprised|surpreso|shocked|chocado|excited|animado/i.test(thumbnailDescription),
                passed: /emotion|emoção|expression|expressão|surprised|surpreso|shocked|chocado|excited|animado/i.test(thumbnailDescription),
                score: /emotion|emoção|expression|expressão|surprised|surpreso|shocked|chocado|excited|animado/i.test(thumbnailDescription) ? 100 : 50,
                tip: 'Expressões emocionais geram mais cliques'
            },
            composition: {
                value: 'center' in thumbnailDescription.toLowerCase() || 'rule of thirds' in thumbnailDescription.toLowerCase(),
                passed: 'center' in thumbnailDescription.toLowerCase() || 'rule of thirds' in thumbnailDescription.toLowerCase(),
                score: 'center' in thumbnailDescription.toLowerCase() || 'rule of thirds' in thumbnailDescription.toLowerCase() ? 100 : 70,
                tip: 'Composição adequada melhora impacto visual'
            }
        };

        const totalScore = Object.values(validations).reduce((sum, v) => sum + (v.score || 0), 0) / Object.keys(validations).length;
        const passedCount = Object.values(validations).filter(v => v.passed).length;
        const totalChecks = Object.keys(validations).length;

        res.status(200).json({
            thumbnailDescription,
            validations,
            overallScore: Math.round(totalScore),
            passedChecks: `${passedCount}/${totalChecks}`,
            recommendation: totalScore >= 80 ? 'excellent' : totalScore >= 60 ? 'good' : 'needs_improvement',
            tips: Object.values(validations).filter(v => !v.passed && v.tip).map(v => v.tip)
        });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/analytics/validate-thumbnail]:', err);
        res.status(500).json({ msg: 'Erro ao validar thumbnail.' });
    }
});

// 7. Comparação com Competidores
app.post('/api/analytics/compare-competitors', authenticateToken, async (req, res) => {
    const { title, thumbnailDescription, niche, competitorVideoIds } = req.body;
    const userId = req.user.id;

    if (!title || !competitorVideoIds || !Array.isArray(competitorVideoIds)) {
        return res.status(400).json({ msg: 'Título e lista de IDs de vídeos competidores são obrigatórios.' });
    }

    try {
        const geminiKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, 'gemini']);
        if (!geminiKeyData) {
            return res.status(400).json({ msg: 'Chave de API do Gemini é necessária.' });
        }
        const geminiApiKey = decrypt(geminiKeyData.api_key);

        // Buscar dados dos vídeos competidores
        const competitorData = await Promise.all(
            competitorVideoIds.slice(0, 5).map(async (videoId) => {
                try {
                    const data = await callYouTubeDataAPI(videoId, geminiApiKey);
                    return {
                        videoId,
                        title: data.title,
                        views: data.views,
                        likes: data.likes,
                        comments: data.comments,
                        days: data.days
                    };
                } catch (err) {
                    console.error(`Erro ao buscar vídeo ${videoId}:`, err);
                    return null;
                }
            })
        );

        const validCompetitors = competitorData.filter(c => c !== null);

        if (validCompetitors.length === 0) {
            return res.status(400).json({ msg: 'Nenhum vídeo competidor válido encontrado.' });
        }

        // Calcular métricas médias dos competidores
        const avgViews = validCompetitors.reduce((sum, c) => sum + (c.views || 0), 0) / validCompetitors.length;
        const avgLikes = validCompetitors.reduce((sum, c) => sum + (c.likes || 0), 0) / validCompetitors.length;
        const avgComments = validCompetitors.reduce((sum, c) => sum + (c.comments || 0), 0) / validCompetitors.length;

        // Comparar características do título
        const yourTitleLength = title.length;
        const competitorTitleLengths = validCompetitors.map(c => (c.title || '').length);
        const avgCompetitorTitleLength = competitorTitleLengths.reduce((sum, l) => sum + l, 0) / competitorTitleLengths.length;

        // Análise comparativa
        const comparison = {
            titleLength: {
                yours: yourTitleLength,
                average: Math.round(avgCompetitorTitleLength),
                difference: yourTitleLength - avgCompetitorTitleLength,
                better: Math.abs(yourTitleLength - 50) < Math.abs(avgCompetitorTitleLength - 50)
            },
            performance: {
                avgCompetitorViews: Math.round(avgViews),
                avgCompetitorLikes: Math.round(avgLikes),
                avgCompetitorComments: Math.round(avgComments)
            },
            recommendations: []
        };

        if (yourTitleLength < 30) {
            comparison.recommendations.push('Seu título é muito curto. Títulos entre 40-60 caracteres performam melhor.');
        } else if (yourTitleLength > 70) {
            comparison.recommendations.push('Seu título é muito longo. Considere reduzir para melhorar CTR.');
        }

        if (avgViews > 100000) {
            comparison.recommendations.push(`Competidores têm média de ${Math.round(avgViews / 1000)}K views. Considere estudar seus títulos.`);
        }

        res.status(200).json({
            yourTitle: title,
            competitors: validCompetitors,
            comparison,
            score: comparison.titleLength.better ? 75 : 50
        });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/analytics/compare-competitors]:', err);
        res.status(500).json({ msg: 'Erro ao comparar com competidores.' });
    }
});

// === ROTAS DE BIBLIOTECA DE TÍTULOS VIRAIS ===

// Adicionar título à biblioteca (automático quando análise é feita)
app.post('/api/library/titles', authenticateToken, async (req, res) => {
    const { title, niche, subniche, originalViews, originalCtr, formulaType, keywords, viralScore } = req.body;
    const userId = req.user.id;

    if (!title) {
        return res.status(400).json({ msg: 'Título é obrigatório.' });
    }

    try {
        const result = await db.run(
            `INSERT INTO viral_titles_library (user_id, title, niche, subniche, original_views, original_ctr, formula_type, keywords, viral_score)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, title, niche || null, subniche || null, originalViews || null, originalCtr || null, formulaType || null, keywords || null, viralScore || null]
        );
        res.status(201).json({ id: result.lastID, msg: 'Título adicionado à biblioteca.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/library/titles]:', err);
        res.status(500).json({ msg: 'Erro ao adicionar título à biblioteca.' });
    }
});
// Buscar títulos da biblioteca
app.get('/api/library/titles', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { niche, subniche, minViews, minCtr, favorite, search } = req.query;
    console.log(`[Biblioteca Titles] Requisição recebida para userId: ${userId}`, { niche, subniche, minViews, favorite, search });

    try {
        if (!db) {
            console.error('[Biblioteca Titles] Banco de dados não está disponível');
            return res.status(503).json({ msg: 'Banco de dados não está disponível.' });
        }

        let query = 'SELECT * FROM viral_titles_library WHERE user_id = ?';
        const params = [userId];

        if (niche) {
            query += ' AND niche = ?';
            params.push(niche);
        }
        if (subniche) {
            query += ' AND subniche = ?';
            params.push(subniche);
        }
        if (minViews) {
            query += ' AND original_views >= ?';
            params.push(parseInt(minViews));
        }
        if (minCtr) {
            query += ' AND original_ctr >= ?';
            params.push(parseFloat(minCtr));
        }
        if (favorite === 'true') {
            query += ' AND is_favorite = 1';
        }
        if (search) {
            query += ' AND title LIKE ?';
            params.push(`%${search}%`);
        }

        query += ' ORDER BY created_at DESC LIMIT 100';

        console.log(`[Biblioteca Titles] Executando query:`, query.substring(0, 100));
        let titles = [];
        try {
            titles = await db.all(query, params);
            console.log(`[Biblioteca Titles] Títulos encontrados:`, titles.length);
        } catch (dbErr) {
            console.error('[Biblioteca Titles] Erro ao buscar títulos:', dbErr);
            titles = [];
        }

        // Garantir que titles é sempre um array
        const titlesArray = Array.isArray(titles) ? titles : [];
        res.status(200).json(titlesArray);
    } catch (err) {
        console.error('[ERRO NA ROTA /api/library/titles]:', err);
        // Sempre retornar JSON válido (array vazio), nunca HTML
        res.status(200).json([]);
    }
});

// Excluir título da biblioteca
app.delete('/api/library/titles/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        if (!db) {
            return res.status(503).json({ msg: 'Banco de dados não está disponível.' });
        }

        const result = await db.run('DELETE FROM viral_titles_library WHERE id = ? AND user_id = ?', [id, userId]);
        
        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Título não encontrado ou não pertence a este usuário.' });
        }

        console.log(`[Biblioteca] Título ${id} excluído pelo usuário ${userId}`);
        res.status(200).json({ msg: 'Título excluído da biblioteca com sucesso.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/library/titles/:id DELETE]:', err);
        res.status(500).json({ msg: 'Erro ao excluir título da biblioteca.' });
    }
});

// Marcar/desmarcar título como favorito
app.put('/api/library/titles/:id/favorite', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { isFavorite } = req.body;
    const userId = req.user.id;

    try {
        await db.run(
            'UPDATE viral_titles_library SET is_favorite = ? WHERE id = ? AND user_id = ?',
            [isFavorite ? 1 : 0, id, userId]
        );
        res.status(200).json({ msg: 'Favorito atualizado.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/library/titles/:id/favorite]:', err);
        res.status(500).json({ msg: 'Erro ao atualizar favorito.' });
    }
});

// === ROTAS DE BIBLIOTECA DE THUMBNAILS VIRAIS ===

// Adicionar thumbnail à biblioteca
app.post('/api/library/thumbnails', authenticateToken, async (req, res) => {
    const { thumbnailUrl, thumbnailDescription, niche, subniche, originalViews, originalCtr, style, elements, viralScore } = req.body;
    const userId = req.user.id;

    if (!thumbnailUrl && !thumbnailDescription) {
        return res.status(400).json({ msg: 'URL da thumbnail ou descrição é obrigatória.' });
    }

    try {
        const result = await db.run(
            `INSERT INTO viral_thumbnails_library (user_id, thumbnail_url, thumbnail_description, niche, subniche, original_views, original_ctr, style, elements, viral_score)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, thumbnailUrl || null, thumbnailDescription || null, niche || null, subniche || null, originalViews || null, originalCtr || null, style || null, elements || null, viralScore || null]
        );
        res.status(201).json({ id: result.lastID, msg: 'Thumbnail adicionada à biblioteca.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/library/thumbnails]:', err);
        res.status(500).json({ msg: 'Erro ao adicionar thumbnail à biblioteca.' });
    }
});

// Buscar thumbnails da biblioteca
app.get('/api/library/thumbnails', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { niche, subniche, minViews, minCtr, favorite, style } = req.query;
    console.log(`[Biblioteca Thumbnails] Requisição recebida para userId: ${userId}`, { niche, minViews, favorite, style });

    try {
        if (!db) {
            console.error('[Biblioteca Thumbnails] Banco de dados não está disponível');
            return res.status(503).json({ msg: 'Banco de dados não está disponível.' });
        }

        let query = 'SELECT * FROM viral_thumbnails_library WHERE user_id = ?';
        const params = [userId];

        if (niche) {
            query += ' AND niche = ?';
            params.push(niche);
        }
        if (subniche) {
            query += ' AND subniche = ?';
            params.push(subniche);
        }
        if (minViews) {
            query += ' AND original_views >= ?';
            params.push(parseInt(minViews));
        }
        if (minCtr) {
            query += ' AND original_ctr >= ?';
            params.push(parseFloat(minCtr));
        }
        if (favorite === 'true') {
            query += ' AND is_favorite = 1';
        }
        if (style) {
            query += ' AND style = ?';
            params.push(style);
        }

        query += ' ORDER BY created_at DESC LIMIT 100';

        console.log(`[Biblioteca Thumbnails] Executando query:`, query.substring(0, 100));
        let thumbnails = [];
        try {
            thumbnails = await db.all(query, params);
            console.log(`[Biblioteca Thumbnails] Thumbnails encontradas:`, thumbnails.length);
        } catch (dbErr) {
            console.error('[Biblioteca Thumbnails] Erro ao buscar thumbnails:', dbErr);
            thumbnails = [];
        }

        // Garantir que thumbnails é sempre um array
        const thumbnailsArray = Array.isArray(thumbnails) ? thumbnails : [];
        res.status(200).json(thumbnailsArray);
    } catch (err) {
        console.error('[ERRO NA ROTA /api/library/thumbnails]:', err);
        // Sempre retornar JSON válido (array vazio), nunca HTML
        res.status(200).json([]);
    }
});

// Excluir thumbnail da biblioteca
app.delete('/api/library/thumbnails/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        if (!db) {
            return res.status(503).json({ msg: 'Banco de dados não está disponível.' });
        }

        const result = await db.run('DELETE FROM viral_thumbnails_library WHERE id = ? AND user_id = ?', [id, userId]);
        
        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Thumbnail não encontrada ou não pertence a este usuário.' });
        }

        console.log(`[Biblioteca] Thumbnail ${id} excluída pelo usuário ${userId}`);
        res.status(200).json({ msg: 'Thumbnail excluída da biblioteca com sucesso.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/library/thumbnails/:id DELETE]:', err);
        res.status(500).json({ msg: 'Erro ao excluir thumbnail da biblioteca.' });
    }
});

// Marcar/desmarcar thumbnail como favorito
app.put('/api/library/thumbnails/:id/favorite', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { isFavorite } = req.body;
    const userId = req.user.id;

    try {
        await db.run(
            'UPDATE viral_thumbnails_library SET is_favorite = ? WHERE id = ? AND user_id = ?',
            [isFavorite ? 1 : 0, id, userId]
        );
        res.status(200).json({ msg: 'Favorito atualizado.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/library/thumbnails/:id/favorite]:', err);
        res.status(500).json({ msg: 'Erro ao atualizar favorito.' });
    }
});

// === ROTAS DE INTEGRAÇÃO YOUTUBE API ===

// Iniciar OAuth do YouTube (retorna URL de autorização)
app.get('/api/youtube/oauth/authorize', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || 'YOUR_CLIENT_ID';
    const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:5001/api/youtube/oauth/callback';
    const SCOPE = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';

    if (CLIENT_ID === 'YOUR_CLIENT_ID') {
        return res.status(500).json({ msg: 'Credenciais do YouTube não configuradas. Configure YOUTUBE_CLIENT_ID no arquivo .env. Veja CONFIGURACAO_YOUTUBE.md para mais informações.' });
    }

    // Validar e limpar REDIRECT_URI
    let cleanRedirectUri = REDIRECT_URI.trim();
    // Remover barra final se houver
    if (cleanRedirectUri.endsWith('/')) {
        cleanRedirectUri = cleanRedirectUri.slice(0, -1);
    }

    // Criar um state token seguro com o userId
    // Em produção, você deve usar um token JWT ou criptografado
    const stateToken = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');

    // Construir URL de autorização com parâmetros corretos
    const authParams = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: cleanRedirectUri,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent', // Força seleção de conta mesmo se já logado
        include_granted_scopes: 'true', // Permite múltiplas contas
        state: stateToken
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`;

    console.log(`[YouTube OAuth] URL de autorização gerada para userId: ${userId}`);
    console.log(`[YouTube OAuth] Redirect URI: ${cleanRedirectUri}`);

    res.status(200).json({ authUrl, msg: 'Use esta URL para autorizar o acesso ao YouTube.' });
});

// Callback OAuth (será chamado pelo Google após autorização)
// NOTA: Este endpoint não usa authenticateToken porque o Google redireciona diretamente
// O userId é validado através do state parameter
app.get('/api/youtube/oauth/callback', async (req, res) => {
    const { code, error, state } = req.query;
    
    let userId = null;
    
    // Decodificar state para obter userId
    try {
        if (state) {
            const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
            userId = stateData.userId;
            
            // Validar que o state não é muito antigo (máximo 10 minutos)
            const maxAge = 10 * 60 * 1000; // 10 minutos
            if (Date.now() - stateData.timestamp > maxAge) {
                return res.status(400).send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>Erro - Token Expirado</title></head>
                    <body style="font-family: Arial; text-align: center; padding: 50px;">
                        <h1>❌ Token Expirado</h1>
                        <p>O token de autorização expirou. Por favor, tente novamente.</p>
                        <button onclick="window.close()">Fechar</button>
                    </body>
                    </html>
                `);
            }
        } else {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Erro - Estado Inválido</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ Erro na Autorização</h1>
                    <p>Estado inválido. Por favor, tente conectar novamente.</p>
                    <button onclick="window.close()">Fechar</button>
                </body>
                </html>
            `);
        }
    } catch (e) {
        console.error('[YouTube OAuth] Erro ao decodificar state:', e);
        return res.status(400).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Erro - Estado Inválido</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>❌ Erro na Autorização</h1>
                <p>Estado inválido ou corrompido. Por favor, tente conectar novamente.</p>
                <button onclick="window.close()">Fechar</button>
            </body>
            </html>
        `);
    }

    if (error) {
        console.error('[YouTube OAuth] Erro na autorização:', error);
        return res.status(400).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Erro na Autorização</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>❌ Erro na Autorização</h1>
                <p>${error}</p>
                <button onclick="window.close()">Fechar</button>
            </body>
            </html>
        `);
    }

    if (!code) {
        return res.status(400).json({ msg: 'Código de autorização não fornecido.' });
    }

    const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || 'YOUR_CLIENT_ID';
    const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
    let REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:5001/api/youtube/oauth/callback';

    // Limpar e validar REDIRECT_URI
    REDIRECT_URI = REDIRECT_URI.trim();
    if (REDIRECT_URI.endsWith('/')) {
        REDIRECT_URI = REDIRECT_URI.slice(0, -1);
    }

    if (CLIENT_ID === 'YOUR_CLIENT_ID' || CLIENT_SECRET === 'YOUR_CLIENT_SECRET') {
        return res.status(500).json({ msg: 'Credenciais do YouTube não configuradas. Configure YOUTUBE_CLIENT_ID e YOUTUBE_CLIENT_SECRET no arquivo .env' });
    }
    try {
        // Trocar code por access_token e refresh_token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                code: code,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                redirect_uri: REDIRECT_URI,
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('[YouTube OAuth] Erro ao trocar código por token:', errorText);
            return res.status(400).json({ msg: 'Falha ao obter tokens de acesso.' });
        }

        const tokenData = await tokenResponse.json();
        const { access_token, refresh_token, expires_in } = tokenData;

        if (!access_token) {
            return res.status(400).json({ msg: 'Token de acesso não recebido.' });
        }

        // Buscar TODOS os canais da conta Google (até 50 canais)
        const channelsResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
            },
        });

        let availableChannels = [];
        
        if (channelsResponse.ok) {
            const channelsData = await channelsResponse.json();
            if (channelsData.items && channelsData.items.length > 0) {
                availableChannels = channelsData.items.map(item => ({
                    id: item.id,
                    name: item.snippet?.title || 'Canal sem nome',
                    thumbnail: item.snippet?.thumbnails?.default?.url || '',
                    description: item.snippet?.description || ''
                }));
            }
        }

        if (availableChannels.length === 0) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Nenhum Canal Encontrado</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ Nenhum Canal Encontrado</h1>
                    <p>Não foi possível encontrar canais nesta conta Google.</p>
                    <button onclick="window.close()">Fechar</button>
                </body>
                </html>
            `);
        }

        // Verificar quantos canais já estão conectados
        const existingChannelsCount = await db.get(
            'SELECT COUNT(*) as count FROM youtube_integrations WHERE user_id = ? AND is_active = 1',
            [userId]
        );
        const currentCount = existingChannelsCount?.count || 0;
        const maxChannels = 10;
        const remainingSlots = maxChannels - currentCount;

        if (remainingSlots <= 0) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Limite Atingido</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>❌ Limite de Canais Atingido</h1>
                    <p>Você já tem 10 canais conectados. Desconecte um canal antes de adicionar outro.</p>
                    <button onclick="window.close()">Fechar</button>
                </body>
                </html>
            `);
        }

        // Verificar quais canais já estão conectados
        const existingChannels = await db.all(
            'SELECT channel_id FROM youtube_integrations WHERE user_id = ? AND is_active = 1',
            [userId]
        );
        const existingChannelIds = new Set(existingChannels.map(c => c.channel_id));

        // Filtrar canais já conectados e limitar aos slots disponíveis
        const selectableChannels = availableChannels
            .filter(ch => !existingChannelIds.has(ch.id))
            .slice(0, remainingSlots);

        if (selectableChannels.length === 0) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Todos os Canais Já Conectados</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1>ℹ️ Todos os Canais Já Estão Conectados</h1>
                    <p>Todos os canais desta conta Google já estão conectados ou você atingiu o limite de 10 canais.</p>
                    <button onclick="window.close()">Fechar</button>
                </body>
                </html>
            `);
        }

        // Calcular quando o token expira
        const expiresAt = expires_in 
            ? new Date(Date.now() + expires_in * 1000).toISOString()
            : null;

        // Armazenar temporariamente os tokens e dados para processamento posterior
        // Usar uma sessão temporária ou passar via state
        const tempSessionId = `temp_${userId}_${Date.now()}`;
        
        // Salvar dados temporários (em produção, use Redis ou similar)
        // Por enquanto, vamos passar via query params criptografados ou usar uma abordagem diferente
        // Vou criar uma rota POST para processar a seleção
        
        // Retornar página de seleção de canais
        const channelsHTML = selectableChannels.map((channel, index) => `
            <div class="channel-item" style="display: flex; align-items: center; padding: 1rem; background: rgba(255,255,255,0.1); border-radius: 8px; margin-bottom: 1rem; cursor: pointer; transition: all 0.3s;" 
                 onmouseover="this.style.background='rgba(255,255,255,0.2)'" 
                 onmouseout="this.style.background='rgba(255,255,255,0.1)'"
                 onclick="toggleChannel('${channel.id}', '${channel.name.replace(/'/g, "\\'")}')">
                <input type="checkbox" id="channel_${channel.id}" value="${channel.id}" style="margin-right: 1rem; width: 20px; height: 20px; cursor: pointer;">
                ${channel.thumbnail ? `<img src="${channel.thumbnail}" style="width: 48px; height: 48px; border-radius: 50%; margin-right: 1rem;" alt="${channel.name}">` : ''}
                <div style="flex: 1;">
                    <div style="font-weight: bold; margin-bottom: 0.25rem;">${channel.name}</div>
                    <div style="font-size: 0.85rem; opacity: 0.8;">ID: ${channel.id}</div>
                </div>
            </div>
        `).join('');

        res.status(200).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Selecionar Canais - YouTube</title>
                <style>
                    * { box-sizing: border-box; }
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                        margin: 0;
                        padding: 2rem;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        min-height: 100vh;
                    }
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        background: rgba(255, 255, 255, 0.1);
                        border-radius: 15px;
                        padding: 2rem;
                        backdrop-filter: blur(10px);
                    }
                    h1 { margin-top: 0; text-align: center; }
                    .info {
                        background: rgba(255, 255, 255, 0.15);
                        padding: 1rem;
                        border-radius: 8px;
                        margin-bottom: 1.5rem;
                        font-size: 0.9rem;
                    }
                    .channel-item:hover {
                        transform: translateX(5px);
                    }
                    .actions {
                        display: flex;
                        gap: 1rem;
                        margin-top: 2rem;
                    }
                    button {
                        flex: 1;
                        padding: 1rem;
                        border: none;
                        border-radius: 8px;
                        font-size: 1rem;
                        font-weight: bold;
                        cursor: pointer;
                        transition: all 0.3s;
                    }
                    .btn-primary {
                        background: white;
                        color: #667eea;
                    }
                    .btn-primary:hover {
                        background: #f0f0f0;
                        transform: scale(1.02);
                    }
                    .btn-secondary {
                        background: rgba(255, 255, 255, 0.2);
                        color: white;
                    }
                    .btn-secondary:hover {
                        background: rgba(255, 255, 255, 0.3);
                    }
                    .btn-primary:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎬 Selecione os Canais</h1>
                    <div class="info">
                        <strong>📊 Encontrados:</strong> ${selectableChannels.length} canal(is) disponível(is)<br>
                        <strong>✅ Você pode selecionar até:</strong> ${remainingSlots} canal(is)
                    </div>
                    <form id="channelsForm">
                        ${channelsHTML}
                    </form>
                    <div class="actions">
                        <button type="button" class="btn-secondary" onclick="window.close()">Cancelar</button>
                        <button type="button" class="btn-primary" id="connectBtn" onclick="connectSelectedChannels()" disabled>
                            Conectar Canais Selecionados (0)
                        </button>
                    </div>
                </div>
                <script>
                    const selectedChannels = new Set();
                    const channelsData = ${JSON.stringify(selectableChannels)};
                    const accessToken = '${access_token}';
                    const refreshToken = '${refresh_token || ''}';
                    const expiresAt = '${expiresAt || ''}';
                    const userId = ${userId};
                    
                    function toggleChannel(channelId, channelName) {
                        const checkbox = document.getElementById('channel_' + channelId);
                        if (selectedChannels.has(channelId)) {
                            selectedChannels.delete(channelId);
                            checkbox.checked = false;
                        } else {
                            selectedChannels.add(channelId);
                            checkbox.checked = true;
                        }
                        updateButton();
                    }
                    
                    function updateButton() {
                        const btn = document.getElementById('connectBtn');
                        const count = selectedChannels.size;
                        btn.disabled = count === 0;
                        btn.textContent = 'Conectar Canais Selecionados (' + count + ')';
                    }
                    
                    async function connectSelectedChannels() {
                        if (selectedChannels.size === 0) return;
                        
                        const btn = document.getElementById('connectBtn');
                        btn.disabled = true;
                        btn.textContent = 'Conectando...';
                        
                        try {
                            // Detectar a URL base automaticamente
                            // Se estiver em localhost, usar porta 5001, senão usar a mesma origem
                            let apiBase;
                            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                                apiBase = 'http://localhost:5001';
                            } else {
                                // Em produção, usar a mesma origem
                                apiBase = window.location.origin;
                            }
                            
                            const response = await fetch(apiBase + '/api/youtube/oauth/connect-channels', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    userId: userId,
                                    channelIds: Array.from(selectedChannels),
                                    accessToken: accessToken,
                                    refreshToken: refreshToken,
                                    expiresAt: expiresAt
                                })
                            });
                            
                            const data = await response.json();
                            
                            if (response.ok) {
                                document.body.innerHTML = \`
                                    <div class="container" style="text-align: center;">
                                        <h1>✅ Canais Conectados com Sucesso!</h1>
                                        <p>\${data.connected} canal(is) conectado(s)</p>
                                        <p>Você pode fechar esta janela e voltar ao dashboard.</p>
                                        <button class="btn-primary" onclick="window.close()">Fechar</button>
                                    </div>
                                \`;
                            } else {
                                throw new Error(data.msg || 'Erro ao conectar canais');
                            }
                        } catch (err) {
                            alert('Erro: ' + err.message);
                            btn.disabled = false;
                            updateButton();
                        }
                    }
                    
                    // Permitir clicar em qualquer lugar do item para selecionar
                    document.querySelectorAll('.channel-item').forEach(item => {
                        item.addEventListener('click', function(e) {
                            if (e.target.type !== 'checkbox') {
                                const checkbox = this.querySelector('input[type="checkbox"]');
                                checkbox.click();
                            }
                        });
                    });
                </script>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('[YouTube OAuth] Erro no callback:', err);
        return res.status(500).json({ msg: `Erro ao processar autorização: ${err.message}` });
    }
});

// === PARTE 2: AUTOMAÇÃO E INTEGRAÇÃO COM YOUTUBE ===

// A.1 - Agendamento Inteligente: IA sugere melhor horário para publicar baseado no nicho
app.post('/api/youtube/suggest-best-time', authenticateToken, async (req, res) => {
    const { niche, subniche, timezone } = req.body;
    const userId = req.user.id;

    if (!niche) {
        return res.status(400).json({ msg: 'Nicho é obrigatório para sugerir horário.' });
    }

    try {
        // Tentar usar Gemini primeiro, depois Claude, depois OpenAI
        const services = ['gemini', 'claude', 'openai'];
        let bestTime = null;
        let explanation = '';

        for (const service of services) {
            try {
                const serviceKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, service]);
                if (!serviceKeyData) continue;

                const decryptedKey = decrypt(serviceKeyData.api_key);
                if (!decryptedKey) continue;

                let apiCallFunction;
                let model;
                if (service === 'gemini') {
                    apiCallFunction = callGeminiAPI;
                    model = 'gemini-2.0-flash';
                } else if (service === 'claude') {
                    apiCallFunction = callClaudeAPI;
                    model = 'claude-3-5-haiku-20241022';
                } else {
                    apiCallFunction = callOpenAIAPI;
                    model = 'gpt-4o-mini';
                }

                const prompt = `Você é um especialista em estratégia de YouTube e análise de dados de engajamento.

Analise o nicho "${niche}"${subniche ? ` e subnicho "${subniche}"` : ''} e sugira o MELHOR horário para publicar vídeos neste nicho.

Considere:
1. Horários de pico de engajamento para este nicho específico
2. Fuso horário do público-alvo (principalmente Brasil/América Latina)
3. Dias da semana que performam melhor
4. Padrões de comportamento do público deste nicho

Responda APENAS com um JSON válido no formato:
{
  "bestTime": "HH:MM" (formato 24h, ex: "18:00"),
  "bestDays": ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"] (array com os melhores dias),
  "explanation": "Explicação detalhada do porquê este horário é ideal",
  "alternativeTimes": ["HH:MM", "HH:MM"] (2-3 horários alternativos)
}

IMPORTANTE: Responda APENAS com o JSON, sem texto adicional.`;

                const response = await apiCallFunction(prompt, decryptedKey, model);
                const responseText = response.titles || response.text || '';
                
                // Tentar extrair JSON da resposta
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (parsed.bestTime) {
                            bestTime = parsed;
                            explanation = parsed.explanation || '';
                            console.log(`[Agendamento Inteligente] Horário sugerido usando ${service}: ${parsed.bestTime}`);
                            break;
                        }
                    } catch (e) {
                        console.warn(`[Agendamento Inteligente] Falha ao parsear JSON de ${service}:`, e.message);
                    }
                }
            } catch (serviceErr) {
                console.warn(`[Agendamento Inteligente] Falha com ${service}:`, serviceErr.message);
                continue;
            }
        }

        // Fallback: horários padrão baseados em pesquisas gerais
        if (!bestTime) {
            const defaultTimes = {
                'Entretenimento': { bestTime: '18:00', bestDays: ['sexta', 'sábado', 'domingo'], explanation: 'Horário de pico para entretenimento: fim de tarde e fins de semana' },
                'Educação': { bestTime: '19:00', bestDays: ['segunda', 'terça', 'quarta', 'quinta'], explanation: 'Horário ideal para conteúdo educativo: início da noite em dias úteis' },
                'Tecnologia': { bestTime: '20:00', bestDays: ['terça', 'quarta', 'quinta'], explanation: 'Público de tecnologia mais ativo no início da noite' },
                'Finanças': { bestTime: '08:00', bestDays: ['segunda', 'terça', 'quarta'], explanation: 'Horário de trabalho: público financeiro mais ativo pela manhã' }
            };
            
            const nicheKey = Object.keys(defaultTimes).find(k => niche.toLowerCase().includes(k.toLowerCase()));
            bestTime = nicheKey ? defaultTimes[nicheKey] : { bestTime: '18:00', bestDays: ['sexta', 'sábado'], explanation: 'Horário padrão otimizado para engajamento geral' };
            bestTime.alternativeTimes = ['16:00', '20:00'];
        }

        res.status(200).json({
            suggestedTime: bestTime.bestTime,
            suggestedDays: bestTime.bestDays || ['sexta', 'sábado'],
            explanation: bestTime.explanation || explanation,
            alternativeTimes: bestTime.alternativeTimes || []
        });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/suggest-best-time]:', err);
        res.status(500).json({ msg: 'Erro ao sugerir horário de publicação.' });
    }
});

// A.3 - Auto-tags e Descrição: Preencher automaticamente tags e descrição otimizadas
app.post('/api/youtube/generate-metadata', authenticateToken, async (req, res) => {
    const { title, niche, subniche, videoDescription } = req.body;
    const userId = req.user.id;

    if (!title) {
        return res.status(400).json({ msg: 'Título é obrigatório para gerar metadata.' });
    }

    try {
        // Tentar usar Gemini primeiro, depois Claude, depois OpenAI
        const services = ['gemini', 'claude', 'openai'];
        let metadata = null;

        for (const service of services) {
            try {
                const serviceKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, service]);
                if (!serviceKeyData) continue;

                const decryptedKey = decrypt(serviceKeyData.api_key);
                if (!decryptedKey) continue;

                let apiCallFunction;
                let model;
                if (service === 'gemini') {
                    apiCallFunction = callGeminiAPI;
                    model = 'gemini-2.0-flash';
                } else if (service === 'claude') {
                    apiCallFunction = callClaudeAPI;
                    model = 'claude-3-5-haiku-20241022';
                } else {
                    apiCallFunction = callOpenAIAPI;
                    model = 'gpt-4o-mini';
                }

                const prompt = `Você é um especialista em SEO e otimização de conteúdo para YouTube.

Título do vídeo: "${title}"
${niche ? `Nicho: "${niche}"` : ''}
${subniche ? `Subnicho: "${subniche}"` : ''}
${videoDescription ? `Descrição do conteúdo: "${videoDescription}"` : ''}

Sua tarefa é gerar:
1. Uma descrição otimizada para SEO (mínimo 200 palavras) que inclua:
   - Hook inicial poderoso
   - Palavras-chave principais
   - Resumo do conteúdo
   - Call-to-action
   - Links relevantes (use [LINK] como placeholder)
   - Timestamps se aplicável (use [TIMESTAMP] como placeholder)

2. Tags otimizadas (15-20 tags) que incluam:
   - Palavras-chave principais
   - Variações de palavras-chave
   - Termos relacionados
   - Termos de busca longa

Responda APENAS com um JSON válido no formato:
{
  "description": "Descrição completa otimizada para SEO...",
  "tags": ["tag1", "tag2", "tag3", ...]
}
IMPORTANTE: 
- A descrição deve ser em português (Brasil)
- As tags devem ser em português e inglês (quando relevante)
- Foque em palavras-chave com alto volume de busca
- Otimize para aparecer nas sugestões do YouTube

Responda APENAS com o JSON, sem texto adicional.`;

                const response = await apiCallFunction(prompt, decryptedKey, model);
                const responseText = response.titles || response.text || '';
                
                // Tentar extrair JSON da resposta
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (parsed.description && parsed.tags && Array.isArray(parsed.tags)) {
                            metadata = parsed;
                            console.log(`[Auto-metadata] Metadata gerada usando ${service} (${parsed.tags.length} tags)`);
                            break;
                        }
                    } catch (e) {
                        console.warn(`[Auto-metadata] Falha ao parsear JSON de ${service}:`, e.message);
                    }
                }
            } catch (serviceErr) {
                console.warn(`[Auto-metadata] Falha com ${service}:`, serviceErr.message);
                continue;
            }
        }

        // Fallback: gerar metadata básica
        if (!metadata) {
            const keywords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            metadata = {
                description: `${title}\n\n${videoDescription || 'Conteúdo exclusivo sobre ' + (subniche || niche || 'este tema') + '. Não perca!'}\n\n🔔 Inscreva-se no canal para mais conteúdo!\n👍 Deixe seu like se gostou!\n💬 Comente o que achou!\n\n#${(subniche || niche || 'youtube').replace(/\s+/g, '')}`,
                tags: keywords.slice(0, 15).concat([niche, subniche].filter(Boolean))
            };
        }

        res.status(200).json({
            description: metadata.description,
            tags: metadata.tags
        });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/generate-metadata]:', err);
        res.status(500).json({ msg: 'Erro ao gerar metadata.' });
    }
});

// Agendar publicação de vídeo (mantido para compatibilidade, mas agora com suporte a auto-metadata)
app.post('/api/youtube/schedule', authenticateToken, async (req, res) => {
    const { youtubeIntegrationId, videoFilePath, title, description, tags, thumbnailUrl, scheduledTime, autoGenerateMetadata } = req.body;
    const userId = req.user.id;

    if (!title || !scheduledTime) {
        return res.status(400).json({ msg: 'Título e horário agendado são obrigatórios.' });
    }

    try {
        let finalDescription = description;
        let finalTags = tags;

        // Se autoGenerateMetadata estiver ativado, gerar automaticamente
        if (autoGenerateMetadata) {
            try {
                // Buscar niche/subniche do usuário ou do vídeo
                const userChannel = await db.get('SELECT niche, subniche FROM user_channels WHERE user_id = ? LIMIT 1', [userId]);
                const metadata = await fetch(`${req.protocol}://${req.get('host')}/api/youtube/generate-metadata`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': req.headers['authorization']
                    },
                    body: JSON.stringify({
                        title: title,
                        niche: userChannel?.niche || null,
                        subniche: userChannel?.subniche || null
                    })
                });

                if (metadata.ok) {
                    const metadataData = await metadata.json();
                    finalDescription = metadataData.description || description;
                    finalTags = metadataData.tags || tags;
                    console.log('[Agendamento] Metadata gerada automaticamente');
                }
            } catch (metaErr) {
                console.warn('[Agendamento] Falha ao gerar metadata automática, usando valores fornecidos:', metaErr.message);
            }
        }

        const result = await db.run(
            `INSERT INTO scheduled_posts (user_id, youtube_integration_id, video_file_path, title, description, tags, thumbnail_url, scheduled_time)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, youtubeIntegrationId || null, videoFilePath || null, title, finalDescription || null, finalTags ? JSON.stringify(finalTags) : null, thumbnailUrl || null, scheduledTime]
        );
        res.status(201).json({ id: result.lastID, msg: 'Publicação agendada com sucesso.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/schedule]:', err);
        res.status(500).json({ msg: 'Erro ao agendar publicação.' });
    }
});

// Listar todos os canais conectados do YouTube
app.get('/api/youtube/channels', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const integrations = await db.all(
            'SELECT id, channel_id, channel_name, token_expires_at, created_at, is_active FROM youtube_integrations WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC',
            [userId]
        );

        const channels = integrations.map(integration => {
            const isExpired = integration.token_expires_at 
                ? new Date(integration.token_expires_at) < new Date()
                : false;
            
            return {
                id: integration.id,
                channelId: integration.channel_id,
                channelName: integration.channel_name,
                niche: integration.niche || null,
                subniche: integration.subniche || null,
                isExpired: isExpired,
                createdAt: integration.created_at
            };
        });

        return res.status(200).json({
            channels: channels,
            count: channels.length,
            maxChannels: 10
        });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/channels]:', err);
        return res.status(500).json({ msg: 'Erro ao listar canais.' });
    }
});

// Verificar status da integração do YouTube (mantido para compatibilidade)
app.get('/api/youtube/status', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const integrations = await db.all(
            'SELECT * FROM youtube_integrations WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC',
            [userId]
        );

        if (!integrations || integrations.length === 0) {
            return res.status(200).json({ 
                connected: false, 
                message: 'Nenhuma integração configurada.',
                channels: []
            });
        }

        // Retornar o canal mais recente para compatibilidade
        const latestIntegration = integrations[0];
        const isExpired = latestIntegration.token_expires_at 
            ? new Date(latestIntegration.token_expires_at) < new Date()
            : false;

        return res.status(200).json({
            connected: true,
            channelId: latestIntegration.channel_id,
            channelName: latestIntegration.channel_name,
            isExpired: isExpired,
            createdAt: latestIntegration.created_at,
            totalChannels: integrations.length,
            channels: integrations.map(i => ({
                id: i.id,
                channelId: i.channel_id,
                channelName: i.channel_name,
                isExpired: i.token_expires_at ? new Date(i.token_expires_at) < new Date() : false
            }))
        });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/status]:', err);
        return res.status(500).json({ msg: 'Erro ao verificar status da integração.' });
    }
});

// Processar seleção de canais após OAuth (rota interna, chamada pela página de seleção)
// NOTA: Esta rota é chamada pela página de seleção após OAuth válido
app.post('/api/youtube/oauth/connect-channels', async (req, res) => {
    const { userId, channelIds, accessToken, refreshToken, expiresAt } = req.body;

    if (!userId || !channelIds || !Array.isArray(channelIds) || channelIds.length === 0) {
        return res.status(400).json({ msg: 'Dados inválidos.' });
    }

    if (!accessToken) {
        return res.status(400).json({ msg: 'Token de acesso não fornecido.' });
    }

    // Validar que userId é um número válido
    const userIdNum = parseInt(userId);
    if (isNaN(userIdNum) || userIdNum <= 0) {
        return res.status(400).json({ msg: 'ID de usuário inválido.' });
    }

    try {
        // Buscar informações dos canais selecionados
        const channelIdsParam = channelIds.join(',');
        const channelsInfoResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelIdsParam}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            }
        );

        if (!channelsInfoResponse.ok) {
            throw new Error('Falha ao buscar informações dos canais');
        }

        const channelsInfo = await channelsInfoResponse.json();
        if (!channelsInfo.items || channelsInfo.items.length === 0) {
            throw new Error('Nenhum canal encontrado');
        }

        // Verificar limite antes de conectar
        const existingChannelsCount = await db.get(
            'SELECT COUNT(*) as count FROM youtube_integrations WHERE user_id = ? AND is_active = 1',
            [userIdNum]
        );
        const currentCount = existingChannelsCount?.count || 0;
        const maxChannels = 10;
        const remainingSlots = maxChannels - currentCount;

        if (channelIds.length > remainingSlots) {
            return res.status(400).json({ 
                msg: `Você só pode adicionar mais ${remainingSlots} canal(is). Você selecionou ${channelIds.length}.` 
            });
        }

        // Verificar quais canais já estão conectados
        const existingChannels = await db.all(
            'SELECT channel_id FROM youtube_integrations WHERE user_id = ? AND is_active = 1',
            [userId]
        );
        const existingChannelIds = new Set(existingChannels.map(c => c.channel_id));

        let connectedCount = 0;
        let updatedCount = 0;

        // Conectar cada canal selecionado
        for (const channelItem of channelsInfo.items) {
            const channelId = channelItem.id;
            const channelName = channelItem.snippet?.title || 'Canal do YouTube';

            // Pular se já está conectado
            if (existingChannelIds.has(channelId)) {
                continue;
            }

            // Verificar se já existe (mas inativo)
            const existingIntegration = await db.get(
                'SELECT id FROM youtube_integrations WHERE user_id = ? AND channel_id = ?',
                [userIdNum, channelId]
            );

            // Conectar o canal primeiro (sem bloquear na análise)
            let integrationId;
            if (existingIntegration) {
                // Atualizar integração existente
                await db.run(
                    `UPDATE youtube_integrations 
                     SET access_token = ?, refresh_token = ?, token_expires_at = ?, 
                         channel_name = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [accessToken, refreshToken || null, expiresAt, channelName, existingIntegration.id]
                );
                integrationId = existingIntegration.id;
                updatedCount++;
            } else {
                // Criar nova integração
                const result = await db.run(
                    `INSERT INTO youtube_integrations (user_id, channel_id, channel_name, access_token, refresh_token, token_expires_at, is_active)
                     VALUES (?, ?, ?, ?, ?, ?, 1)`,
                    [userIdNum, channelId, channelName, accessToken, refreshToken || null, expiresAt]
                );
                integrationId = result.lastID;
                connectedCount++;
            }

            // Analisar canal em background (não bloqueia a resposta)
            analyzeChannelNiche(channelId, channelName, accessToken, userIdNum)
                .then(nicheAnalysis => {
                    if (nicheAnalysis.niche || nicheAnalysis.subniche) {
                        console.log(`[YouTube OAuth] Nicho detectado para ${channelName}: ${nicheAnalysis.niche} / ${nicheAnalysis.subniche}`);
                        // Atualizar o canal com o nicho detectado
                        db.run(
                            `UPDATE youtube_integrations 
                             SET niche = ?, subniche = ?, updated_at = CURRENT_TIMESTAMP 
                             WHERE id = ?`,
                            [nicheAnalysis.niche, nicheAnalysis.subniche, integrationId]
                        ).catch(err => {
                            console.error(`[YouTube OAuth] Erro ao salvar nicho detectado:`, err.message);
                        });
                    }
                })
                .catch(nicheErr => {
                    console.warn(`[YouTube OAuth] Erro ao analisar nicho do canal ${channelId}:`, nicheErr.message);
                    // Não fazer nada, o canal já está conectado
                });
        }

        console.log(`[YouTube OAuth] Canais conectados: ${connectedCount} novos, ${updatedCount} atualizados para userId: ${userIdNum}`);

        return res.status(200).json({
            msg: 'Canais conectados com sucesso!',
            connected: connectedCount + updatedCount,
            new: connectedCount,
            updated: updatedCount
        });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/oauth/connect-channels]:', err);
        return res.status(500).json({ msg: `Erro ao conectar canais: ${err.message}` });
    }
});

// Desconectar/remover um canal
app.delete('/api/youtube/channels/:id', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const integrationId = parseInt(req.params.id);

    try {
        // Verificar se a integração pertence ao usuário
        const integration = await db.get(
            'SELECT id FROM youtube_integrations WHERE id = ? AND user_id = ?',
            [integrationId, userId]
        );

        if (!integration) {
            return res.status(404).json({ msg: 'Canal não encontrado.' });
        }

        // Desativar a integração (soft delete)
        await db.run(
            'UPDATE youtube_integrations SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [integrationId]
        );

        console.log(`[YouTube] Canal desconectado: userId=${userId}, integrationId=${integrationId}`);
        return res.status(200).json({ msg: 'Canal desconectado com sucesso.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/channels/:id DELETE]:', err);
        return res.status(500).json({ msg: 'Erro ao desconectar canal.' });
    }
});

// Listar publicações agendadas
app.get('/api/youtube/scheduled', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    console.log(`[YouTube Scheduled] Requisição recebida para userId: ${userId}`);

    try {
        if (!db) {
            console.error('[YouTube Scheduled] Banco de dados não está disponível');
            return res.status(503).json({ msg: 'Banco de dados não está disponível.' });
        }

        let scheduled = [];
        try {
            scheduled = await db.all(
                'SELECT * FROM scheduled_posts WHERE user_id = ? ORDER BY scheduled_time ASC',
                [userId]
            );
            console.log(`[YouTube Scheduled] Publicações encontradas:`, scheduled.length);
        } catch (dbErr) {
            console.error('[YouTube Scheduled] Erro ao buscar publicações:', dbErr);
            scheduled = [];
        }

        res.status(200).json(scheduled || []);
    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/scheduled]:', err);
        // Retornar array vazio se a tabela não existir
        res.status(200).json([]);
    }
});

// === PARTE 2.B: MONITORAMENTO AUTOMÁTICO ===

// B.1 - Alertas de Vídeos Virais: Verificar e notificar sobre vídeos virais de competidores
app.get('/api/youtube/viral-alerts', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const alerts = await db.all(
            `SELECT * FROM viral_alerts 
             WHERE user_id = ? AND notified = 0 
             ORDER BY detected_at DESC 
             LIMIT 50`,
            [userId]
        );

        res.status(200).json({ alerts: alerts || [] });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/viral-alerts]:', err);
        res.status(500).json({ msg: 'Erro ao buscar alertas virais.' });
    }
});

// B.2 - Análise Automática de Tendências: Escanear YouTube por novos vídeos virais
app.post('/api/youtube/scan-trends', authenticateToken, async (req, res) => {
    const { niche, subniche, maxResults = 10 } = req.body;
    const userId = req.user.id;

    if (!niche) {
        return res.status(400).json({ msg: 'Nicho é obrigatório para escanear tendências.' });
    }

    try {
        // Buscar chave do Gemini (necessária para YouTube API)
        const geminiKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, 'gemini']);
        if (!geminiKeyData) {
            return res.status(400).json({ msg: 'Chave de API do Gemini é necessária para escanear tendências.' });
        }

        const geminiApiKey = decrypt(geminiKeyData.api_key);
        if (!geminiApiKey) {
            return res.status(500).json({ msg: 'Falha ao desencriptar a chave do Gemini.' });
        }

        // Buscar vídeos virais recentes usando YouTube Data API
        const searchQuery = `${niche} ${subniche || ''}`.trim();
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&order=viewCount&maxResults=${maxResults}&publishedAfter=${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}&key=${geminiApiKey}`;
        
        const searchResponse = await fetch(searchUrl);
        if (!searchResponse.ok) {
            throw new Error('Falha ao buscar vídeos do YouTube.');
        }

        const searchData = await searchResponse.json();
        const videoIds = searchData.items.map(item => item.id.videoId).join(',');
        
        if (!videoIds) {
            return res.status(200).json({ trends: [], msg: 'Nenhum vídeo encontrado.' });
        }

        // Buscar detalhes dos vídeos
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${geminiApiKey}`;
        const detailsResponse = await fetch(detailsUrl);
        const detailsData = await detailsResponse.json();

        const trends = [];
        for (const video of detailsData.items || []) {
            const views = parseInt(video.statistics.viewCount || 0);
            const publishedAt = new Date(video.snippet.publishedAt);
            const daysSince = Math.round((new Date() - publishedAt) / (1000 * 60 * 60 * 24));
            const viewsPerDay = daysSince > 0 ? views / daysSince : views;

            // Verificar se é viral
            if (isViralVideo(views, daysSince, viewsPerDay)) {
                const videoData = {
                    videoId: video.id,
                    title: video.snippet.title,
                    url: `https://www.youtube.com/watch?v=${video.id}`,
                    channelId: video.snippet.channelId,
                    channelName: video.snippet.channelTitle,
                    views: views,
                    viewsPerDay: Math.round(viewsPerDay),
                    daysSince: daysSince,
                    thumbnailUrl: video.snippet.thumbnails.high?.url || video.snippet.thumbnails.default?.url
                };

                // Salvar na tabela de tendências
                await db.run(
                    `INSERT INTO trend_analysis (user_id, niche, subniche, video_id, video_title, video_url, channel_id, channel_name, views, views_per_day)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [userId, niche, subniche || null, video.id, video.snippet.title, videoData.url, video.snippet.channelId, video.snippet.channelTitle, views, viewsPerDay]
                );

                trends.push(videoData);
            }
        }

        res.status(200).json({ 
            trends: trends,
            count: trends.length,
            msg: `${trends.length} vídeo(s) viral(is) encontrado(s) no nicho ${niche}.`
        });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/scan-trends]:', err);
        res.status(500).json({ msg: err.message || 'Erro ao escanear tendências.' });
    }
});
// B.3 - Auto-análise de Canais Competidores: Adicionar canal para monitoramento automático
app.post('/api/youtube/monitor-competitor', authenticateToken, async (req, res) => {
    const { competitorChannelId, competitorChannelName, niche, subniche, autoAnalyze = true, checkFrequency = 'daily' } = req.body;
    const userId = req.user.id;

    if (!competitorChannelId) {
        return res.status(400).json({ msg: 'ID do canal competidor é obrigatório.' });
    }

    try {
        // Verificar se já está sendo monitorado
        const existing = await db.get(
            'SELECT * FROM competitor_monitoring WHERE user_id = ? AND competitor_channel_id = ?',
            [userId, competitorChannelId]
        );

        if (existing) {
            // Atualizar configurações
            await db.run(
                `UPDATE competitor_monitoring 
                 SET competitor_channel_name = ?, niche = ?, subniche = ?, auto_analyze = ?, check_frequency = ?
                 WHERE id = ?`,
                [competitorChannelName || existing.competitor_channel_name, niche || null, subniche || null, autoAnalyze ? 1 : 0, checkFrequency, existing.id]
            );
            return res.status(200).json({ id: existing.id, msg: 'Configurações de monitoramento atualizadas.' });
        } else {
            // Criar novo monitoramento
            const result = await db.run(
                `INSERT INTO competitor_monitoring (user_id, competitor_channel_id, competitor_channel_name, niche, subniche, auto_analyze, check_frequency)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, competitorChannelId, competitorChannelName || null, niche || null, subniche || null, autoAnalyze ? 1 : 0, checkFrequency]
            );
            return res.status(201).json({ id: result.lastID, msg: 'Canal adicionado para monitoramento automático.' });
        }
    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/monitor-competitor]:', err);
        res.status(500).json({ msg: 'Erro ao configurar monitoramento.' });
    }
});

// Listar canais monitorados
app.get('/api/youtube/monitored-competitors', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const competitors = await db.all(
            'SELECT * FROM competitor_monitoring WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );

        res.status(200).json({ competitors: competitors || [] });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/monitored-competitors]:', err);
        res.status(500).json({ msg: 'Erro ao listar canais monitorados.' });
    }
});

// Remover canal do monitoramento
app.delete('/api/youtube/monitor-competitor/:id', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
        const result = await db.run(
            'DELETE FROM competitor_monitoring WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Monitoramento não encontrado.' });
        }

        res.status(200).json({ msg: 'Monitoramento removido com sucesso.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/monitor-competitor DELETE]:', err);
        res.status(500).json({ msg: 'Erro ao remover monitoramento.' });
    }
});

// B.4 - Sugestões Automáticas: IA sugere novos vídeos baseado em tendências
app.get('/api/youtube/ai-suggestions', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    try {
        const suggestions = await db.all(
            `SELECT * FROM ai_suggestions 
             WHERE user_id = ? AND viewed = 0 
             ORDER BY priority DESC, created_at DESC 
             LIMIT ?`,
            [userId, parseInt(limit)]
        );

        res.status(200).json({ suggestions: suggestions || [] });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/ai-suggestions]:', err);
        res.status(500).json({ msg: 'Erro ao buscar sugestões.' });
    }
});

// Gerar sugestões automáticas baseadas em tendências
app.post('/api/youtube/generate-suggestions', authenticateToken, async (req, res) => {
    const { niche, subniche } = req.body;
    const userId = req.user.id;

    if (!niche) {
        return res.status(400).json({ msg: 'Nicho é obrigatório para gerar sugestões.' });
    }

    try {
        // Buscar tendências recentes do usuário
        const recentTrends = await db.all(
            `SELECT * FROM trend_analysis 
             WHERE user_id = ? AND niche = ? AND analyzed = 0 
             ORDER BY detected_at DESC LIMIT 5`,
            [userId, niche]
        );

        if (recentTrends.length === 0) {
            return res.status(200).json({ 
                suggestions: [],
                msg: 'Nenhuma tendência recente encontrada. Execute uma análise de tendências primeiro.'
            });
        }

        // Tentar usar IA para gerar sugestões baseadas nas tendências
        const services = ['gemini', 'claude', 'openai'];
        let suggestions = [];

        for (const service of services) {
            try {
                const serviceKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, service]);
                if (!serviceKeyData) continue;

                const decryptedKey = decrypt(serviceKeyData.api_key);
                if (!decryptedKey) continue;

                let apiCallFunction;
                let model;
                if (service === 'gemini') {
                    apiCallFunction = callGeminiAPI;
                    model = 'gemini-2.0-flash';
                } else if (service === 'claude') {
                    apiCallFunction = callClaudeAPI;
                    model = 'claude-3-5-haiku-20241022';
                } else {
                    apiCallFunction = callOpenAIAPI;
                    model = 'gpt-4o-mini';
                }

                const trendsSummary = recentTrends.map(t => `- "${t.video_title}" (${t.views} views em ${t.views_per_day} views/dia)`).join('\n');

                const prompt = `Você é um especialista em criação de conteúdo viral para YouTube.

Analise as seguintes tendências virais no nicho "${niche}"${subniche ? ` e subnicho "${subniche}"` : ''}:

${trendsSummary}

Com base nessas tendências virais, sugira 5 NOVOS vídeos que o criador poderia fazer para aproveitar essas tendências e potencialmente viralizar também.

Para cada sugestão, forneça:
1. Um título viral e chamativo
2. Uma breve descrição do conceito do vídeo
3. O motivo pelo qual esta ideia tem potencial de viralizar

Responda APENAS com um JSON válido no formato:
{
  "suggestions": [
    {
      "title": "Título viral sugerido",
      "description": "Descrição do conceito do vídeo",
      "reason": "Por que esta ideia tem potencial de viralizar",
      "priority": 8 (1-10, sendo 10 o maior potencial)
    },
    ...
  ]
}

IMPORTANTE: 
- Os títulos devem ser em português (Brasil)
- Foque em ideias que aproveitem os padrões das tendências analisadas
- Seja específico e criativo
- Priorize ideias com alto potencial de engajamento

Responda APENAS com o JSON, sem texto adicional.`;

                const response = await apiCallFunction(prompt, decryptedKey, model);
                const responseText = response.titles || response.text || '';
                
                // Tentar extrair JSON da resposta
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
                            // Salvar sugestões no banco
                            for (const suggestion of parsed.suggestions) {
                                await db.run(
                                    `INSERT INTO ai_suggestions (user_id, suggestion_type, title, description, niche, subniche, reason, priority)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                    [userId, 'trend_based', suggestion.title, suggestion.description, niche, subniche || null, suggestion.reason, suggestion.priority || 5]
                                );
                            }
                            suggestions = parsed.suggestions;
                            console.log(`[Sugestões IA] ${suggestions.length} sugestões geradas usando ${service}`);
                            break;
                        }
                    } catch (e) {
                        console.warn(`[Sugestões IA] Falha ao parsear JSON de ${service}:`, e.message);
                    }
                }
            } catch (serviceErr) {
                console.warn(`[Sugestões IA] Falha com ${service}:`, serviceErr.message);
                continue;
            }
        }

        // Fallback: gerar sugestões básicas baseadas nos títulos das tendências
        if (suggestions.length === 0) {
            for (const trend of recentTrends.slice(0, 3)) {
                await db.run(
                    `INSERT INTO ai_suggestions (user_id, suggestion_type, title, description, niche, subniche, reason, priority)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [userId, 'trend_based', `Versão adaptada: ${trend.video_title}`, `Crie uma versão adaptada deste vídeo viral para seu canal`, niche, subniche || null, `Baseado no vídeo viral "${trend.video_title}" com ${trend.views} views`, 7]
                );
            }
            suggestions = recentTrends.slice(0, 3).map(t => ({
                title: `Versão adaptada: ${t.video_title}`,
                description: `Crie uma versão adaptada deste vídeo viral para seu canal`,
                reason: `Baseado no vídeo viral com ${t.views} views`,
                priority: 7
            }));
        }

        res.status(200).json({ 
            suggestions: suggestions,
            count: suggestions.length,
            msg: `${suggestions.length} sugestão(ões) gerada(s) com sucesso.`
        });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/generate-suggestions]:', err);
        res.status(500).json({ msg: err.message || 'Erro ao gerar sugestões.' });
    }
});

// Marcar sugestão como visualizada
app.put('/api/youtube/ai-suggestions/:id/viewed', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
        await db.run(
            'UPDATE ai_suggestions SET viewed = 1 WHERE id = ? AND user_id = ?',
            [id, userId]
        );

        res.status(200).json({ msg: 'Sugestão marcada como visualizada.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/ai-suggestions PUT]:', err);
        res.status(500).json({ msg: 'Erro ao atualizar sugestão.' });
    }
});

// === ROTAS DE GERENCIAMENTO DE CANAIS DO USUÁRIO ===

// Criar/Atualizar canal do usuário
app.post('/api/channels', authenticateToken, async (req, res) => {
    const { channelName, channelUrl, channelId, niche, language, country } = req.body;
    const userId = req.user.id;

    if (!channelName) {
        return res.status(400).json({ msg: 'Nome do canal é obrigatório.' });
    }

    try {
        if (!db) {
            return res.status(503).json({ msg: 'Banco de dados não está disponível.' });
        }

        // Verificar limite de 10 canais por usuário
        const channelCount = await db.get('SELECT COUNT(*) as count FROM user_channels WHERE user_id = ?', [userId]);
        if (channelCount && channelCount.count >= 10) {
            return res.status(400).json({ msg: 'Limite de 10 canais atingido. Exclua um canal antes de adicionar outro.' });
        }

        // Verificar se já existe um canal com o mesmo nome para este usuário
        const existing = await db.get('SELECT id FROM user_channels WHERE user_id = ? AND channel_name = ?', [userId, channelName]);
        
        if (existing) {
            // Atualizar canal existente
            await db.run(
                `UPDATE user_channels 
                 SET channel_url = ?, channel_id = ?, niche = ?, language = ?, country = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ? AND user_id = ?`,
                [channelUrl || null, channelId || null, niche || null, language || 'pt-BR', country || 'BR', existing.id, userId]
            );
            console.log(`[Canais] Canal ${existing.id} atualizado pelo usuário ${userId}`);
            res.status(200).json({ id: existing.id, msg: 'Canal atualizado com sucesso.' });
        } else {
            // Criar novo canal
            const result = await db.run(
                `INSERT INTO user_channels (user_id, channel_name, channel_url, channel_id, niche, language, country) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, channelName, channelUrl || null, channelId || null, niche || null, language || 'pt-BR', country || 'BR']
            );
            console.log(`[Canais] Canal ${result.lastID} criado pelo usuário ${userId}`);
            res.status(201).json({ id: result.lastID, msg: 'Canal criado com sucesso.' });
        }
    } catch (err) {
        console.error('[ERRO NA ROTA /api/channels POST]:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ msg: 'Já existe um canal com este nome.' });
        }
        res.status(500).json({ msg: 'Erro ao criar/atualizar canal.' });
    }
});

// Listar canais do usuário
app.get('/api/channels', authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        if (!db) {
            return res.status(503).json({ msg: 'Banco de dados não está disponível.' });
        }

        const channels = await db.all(
            'SELECT * FROM user_channels WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        res.status(200).json(channels || []);
    } catch (err) {
        console.error('[ERRO NA ROTA /api/channels GET]:', err);
        res.status(500).json({ msg: 'Erro ao listar canais.' });
    }
});

// Excluir canal do usuário
app.delete('/api/channels/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        if (!db) {
            return res.status(503).json({ msg: 'Banco de dados não está disponível.' });
        }

        const result = await db.run('DELETE FROM user_channels WHERE id = ? AND user_id = ?', [id, userId]);
        
        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Canal não encontrado ou não pertence a este usuário.' });
        }

        console.log(`[Canais] Canal ${id} excluído pelo usuário ${userId}`);
        res.status(200).json({ msg: 'Canal excluído com sucesso.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/channels/:id DELETE]:', err);
        res.status(500).json({ msg: 'Erro ao excluir canal.' });
    }
});

// Atualizar status do canal (ativar/desativar)
app.put('/api/channels/:id/status', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { isActive } = req.body;
    const userId = req.user.id;

    try {
        if (!db) {
            return res.status(503).json({ msg: 'Banco de dados não está disponível.' });
        }

        const result = await db.run(
            'UPDATE user_channels SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [isActive ? 1 : 0, id, userId]
        );
        
        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Canal não encontrado ou não pertence a este usuário.' });
        }

        console.log(`[Canais] Status do canal ${id} atualizado para ${isActive ? 'ativo' : 'inativo'} pelo usuário ${userId}`);
        res.status(200).json({ msg: 'Status do canal atualizado com sucesso.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/channels/:id/status PUT]:', err);
        res.status(500).json({ msg: 'Erro ao atualizar status do canal.' });
    }
});

// Buscar informações do canal a partir da URL
app.post('/api/channels/fetch-info', authenticateToken, async (req, res) => {
    const { channelUrl } = req.body;
    const userId = req.user.id;

    if (!channelUrl) {
        return res.status(400).json({ msg: 'URL do canal é obrigatória.' });
    }

    try {
        if (!db) {
            return res.status(503).json({ msg: 'Banco de dados não está disponível.' });
        }

        const geminiKeyData = await db.get('SELECT api_key FROM user_api_keys WHERE user_id = ? AND service_name = ?', [userId, 'gemini']);
        if (!geminiKeyData) {
            return res.status(400).json({ msg: 'Chave de API do Gemini é necessária.' });
        }
        const geminiApiKey = decrypt(geminiKeyData.api_key);
        if (!geminiApiKey) {
            return res.status(500).json({ msg: 'Falha ao desencriptar a chave do Gemini.' });
        }

        // Extrair ID do canal da URL
        const match = channelUrl.match(/youtube\.com\/(?:@([\w.-]+)|channel\/([\w-]+)|c\/([\w-]+)|user\/([\w-]+))/);
        if (!match) {
            return res.status(400).json({ msg: 'Formato de URL do canal não suportado.' });
        }

        let ytChannelId;
        const handle = match[1];
        const legacyId = match[2] || match[3] || match[4];

        if (handle) {
            const searchApiUrl = `https://www.googleapis.com/youtube/v3/search?part=id&q=${encodeURIComponent(handle)}&type=channel&maxResults=1&key=${geminiApiKey}`;
            const searchResponse = await fetch(searchApiUrl);
            const searchData = await searchResponse.json();
            if (searchResponse.ok && searchData.items && searchData.items.length > 0) {
                ytChannelId = searchData.items[0].id.channelId;
            }
        } else if (legacyId) {
            ytChannelId = legacyId;
        }

        if (!ytChannelId) {
            return res.status(400).json({ msg: 'Não foi possível determinar o ID do canal.' });
        }

        // Buscar informações do canal
        const channelUrl_api = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${ytChannelId}&key=${geminiApiKey}`;
        const channelResponse = await fetch(channelUrl_api);
        const channelData = await channelResponse.json();

        if (!channelResponse.ok || !channelData.items || channelData.items.length === 0) {
            return res.status(400).json({ msg: 'Canal não encontrado.' });
        }

        const channel = channelData.items[0];
        const channelName = channel.snippet.title;
        const channelDescription = channel.snippet.description || '';
        const country = channel.snippet.country || 'BR';
        
        // Detectar idioma baseado no país ou descrição
        let language = 'pt-BR';
        if (country === 'US' || country === 'GB' || country === 'CA' || country === 'AU') {
            language = 'en-US';
        } else if (country === 'ES' || country === 'MX' || country === 'AR' || country === 'CO') {
            language = 'es-ES';
        } else if (country === 'FR') {
            language = 'fr-FR';
        } else if (country === 'DE') {
            language = 'de-DE';
        } else if (country === 'IT') {
            language = 'it-IT';
        } else if (country === 'JP') {
            language = 'ja-JP';
        } else if (country === 'KR') {
            language = 'ko-KR';
        } else if (country === 'CN') {
            language = 'zh-CN';
        }

        // Usar IA para detectar nicho (obrigatório)
        let niche = '';
        try {
            const nichePrompt = `Analise este canal do YouTube e identifique o nicho principal em uma palavra ou frase curta (máximo 3 palavras). Seja específico e preciso.
Nome do Canal: ${channelName}
Descrição: ${channelDescription.substring(0, 500)}

IMPORTANTE: Responda APENAS com o nicho, sem explicações adicionais, sem pontos, sem aspas, sem nada além do nicho.
Exemplos válidos: Tecnologia, Educação Financeira, Gaming, Culinária, Fitness, Entretenimento, História, Ciência, Viagens.

Nicho identificado:`;
            
            console.log('[Canais] Detectando nicho do canal:', channelName);
            const nicheResponse = await callGeminiAPI(nichePrompt, geminiApiKey, 'gemini-2.0-flash-exp');
            if (nicheResponse && nicheResponse.titles) {
                niche = nicheResponse.titles.trim()
                    .split('\n')[0]
                    .replace(/^["']|["']$/g, '') // Remove aspas
                    .replace(/^\.+/, '') // Remove pontos no início
                    .substring(0, 50)
                    .trim();
                console.log('[Canais] Nicho detectado:', niche);
            }
            if (!niche || niche.length < 2) {
                console.warn('[Canais] Nicho não detectado ou muito curto, usando fallback');
                // Fallback: usar primeira palavra da descrição ou nome do canal
                niche = channelDescription.split(' ').slice(0, 2).join(' ').substring(0, 30) || channelName.split(' ').slice(0, 2).join(' ').substring(0, 30) || 'Entretenimento';
            }
        } catch (nicheErr) {
            console.warn('[Canais] Erro ao detectar nicho:', nicheErr.message);
            // Fallback: usar primeira palavra do nome do canal
            niche = channelName.split(' ').slice(0, 2).join(' ').substring(0, 30) || 'Entretenimento';
        }

        // Garantir que sempre há um nicho
        if (!niche || niche.length < 2) {
            niche = 'Entretenimento';
        }

        const responseData = {
            channelName,
            channelId: ytChannelId,
            niche: niche,
            language,
            country
        };
        
        console.log('[Canais] Retornando dados do canal:', responseData);
        res.status(200).json(responseData);
    } catch (err) {
        console.error('[ERRO NA ROTA /api/channels/fetch-info]:', err);
        res.status(500).json({ msg: 'Erro ao buscar informações do canal.' });
    }
});

// ============================================
// INICIAR SERVIDOR (DEPOIS DE TODAS AS ROTAS)
// ============================================
// Variável para garantir que o servidor só inicie UMA vez (proteção contra race condition)
let serverStarted = false;
let startServerInterval = null;
let startServerTimeout = null;

// Função única para iniciar o servidor (garante que só inicie uma vez)
function startServer() {
    // Verificação dupla: flag + app.listening para garantir que não inicie duas vezes
    if (serverStarted) {
        return;
    }
    
    // Marcar como iniciado ANTES de tentar iniciar (previne race condition)
    serverStarted = true;
    
    // Limpar intervalos e timeouts para evitar múltiplas tentativas
    if (startServerInterval) {
        clearInterval(startServerInterval);
        startServerInterval = null;
    }
    if (startServerTimeout) {
        clearTimeout(startServerTimeout);
        startServerTimeout = null;
    }
    
    // Iniciar servidor
    try {
        const server = app.listen(PORT, () => {
            console.log(`🚀 Servidor "La Casa Dark Core" a rodar na porta ${PORT}`);
            if (!db) {
                console.log(`⚠️  Banco de dados ainda não está pronto. Algumas funcionalidades podem não estar disponíveis.`);
            } else {
                console.log(`✅ Todas as rotas registradas e funcionando!`);
            }
        });
        
        // Tratamento de erro para porta em uso
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`❌ Erro: A porta ${PORT} já está em uso.`);
                console.error(`   Por favor, encerre o processo que está usando a porta ${PORT} e tente novamente.`);
                console.error(`   Comando: netstat -ano | findstr :${PORT}`);
            } else {
                console.error('❌ Erro ao iniciar servidor:', err.message);
            }
            // Resetar flag em caso de erro para permitir nova tentativa
            serverStarted = false;
        });
    } catch (err) {
        console.error('❌ Erro ao iniciar servidor:', err.message);
        serverStarted = false;
    }
}

// === SERVIÇO DE TRADUÇÃO ONLINE (Gratuito) ===

/**
 * Traduz texto usando múltiplas APIs gratuitas com fallback
 * Ordem de prioridade:
 * 1. MyMemory Translation API (gratuito, 500 requisições/dia)
 * 2. LibreTranslate (open-source, sem limite se self-hosted)
 * 3. Google Translate via scraping (fallback)
 */
async function translateText(text, fromLang = 'auto', toLang = 'pt') {
    if (!text || text.trim().length === 0) {
        return text;
    }

    // MÉTODO 1: MyMemory Translation API (GRATUITO - 500 req/dia)
    try {
        console.log(`[Tradução] Tentando MyMemory API: ${fromLang} → ${toLang}`);
        const mymemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`;
        const response = await fetch(mymemoryUrl);
        const data = await response.json();
        
        if (response.ok && data.responseData && data.responseData.translatedText) {
            console.log(`[Tradução] ✅ Sucesso com MyMemory API`);
            return data.responseData.translatedText;
        }
    } catch (err) {
        console.warn(`[Tradução] MyMemory falhou:`, err.message);
    }

    // MÉTODO 2: LibreTranslate API (GRATUITO - public instance)
    try {
        console.log(`[Tradução] Tentando LibreTranslate API`);
        const libreTranslateUrl = 'https://libretranslate.de/translate';
        const response = await fetch(libreTranslateUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                q: text,
                source: fromLang === 'auto' ? 'en' : fromLang,
                target: toLang,
                format: 'text'
            })
        });
        const data = await response.json();
        
        if (response.ok && data.translatedText) {
            console.log(`[Tradução] ✅ Sucesso com LibreTranslate API`);
            return data.translatedText;
        }
    } catch (err) {
        console.warn(`[Tradução] LibreTranslate falhou:`, err.message);
    }

    // MÉTODO 3: Usar Gemini AI como fallback (se disponível)
    try {
        console.log(`[Tradução] Tentando fallback com IA interna`);
        // Se o usuário tiver Gemini configurado, podemos usar para tradução
        return text; // Por enquanto retorna o original se todos falharem
    } catch (err) {
        console.warn(`[Tradução] Todos os métodos falharam`);
    }

    return text; // Retorna texto original se todas as traduções falharem
}

// Rota de tradução
app.post('/api/translate', authenticateToken, async (req, res) => {
    const { text, from = 'auto', to = 'pt' } = req.body;

    if (!text || typeof text !== 'string') {
        return res.status(400).json({ msg: 'Texto para tradução é obrigatório.' });
    }

    try {
        const translatedText = await translateText(text, from, to);
        res.status(200).json({
            original: text,
            translated: translatedText,
            from,
            to
        });
    } catch (err) {
        console.error('[ERRO /api/translate]:', err);
        res.status(500).json({ msg: 'Erro ao traduzir texto.' });
    }
});

// Rota de tradução em lote (para múltiplos textos)
app.post('/api/translate/batch', authenticateToken, async (req, res) => {
    const { texts, from = 'auto', to = 'pt' } = req.body;

    if (!Array.isArray(texts) || texts.length === 0) {
        return res.status(400).json({ msg: 'Array de textos é obrigatório.' });
    }

    try {
        const translations = await Promise.all(
            texts.map(text => translateText(text, from, to))
        );

        res.status(200).json({
            translations,
            from,
            to,
            count: translations.length
        });
    } catch (err) {
        console.error('[ERRO /api/translate/batch]:', err);
        res.status(500).json({ msg: 'Erro ao traduzir textos.' });
    }
});

console.log('✅ Serviço de Tradução Online configurado (MyMemory + LibreTranslate)');


// Aguardar a inicialização do banco de dados antes de iniciar o servidor
startServerInterval = setInterval(() => {
    if (global.dbReady && db) {
        startServer();
    }
}, 100);

// Timeout de segurança: iniciar servidor após 3 segundos mesmo se o banco não estiver pronto
startServerTimeout = setTimeout(() => {
    if (!serverStarted) {
        startServer();
    }
}, 3000);