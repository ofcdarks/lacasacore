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

const ytdl = require('ytdl-core'); // Usaremos apenas para o ID
const { YoutubeTranscript } = require('youtube-transcript');
const { fetch } = require('undici');
const { ImageFX, AspectRatio, Model } = require('./imagefx.js');

// --- CONFIGURAÇÃO ---
const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'seu-segredo-jwt-super-secreto-trocar-em-prod';

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'abc123def456ghi789jkl012mno345pqr'; // 32 caracteres
const ALGORITHM = 'aes-256-cbc';

// --- GLOBALS ---
let db;

// --- MIDDLEWARES ---
app.use(cors({
  origin: '*', // Allow any origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Explicitly allow methods
  allowedHeaders: ['Content-Type', 'Authorization'] // Explicitly allow headers
}));
app.use(express.json());
app.use(express.static(__dirname));

// Middleware de tratamento de erros para garantir que sempre retorne JSON
app.use((err, req, res, next) => {
    console.error('Erro no middleware:', err);
    if (!res.headersSent) {
        res.status(500).json({ msg: 'Erro interno do servidor.' });
    }
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
    // Etapa 1: Buscar IDs dos vídeos
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&order=${order}&maxResults=${maxResults}&type=video&key=${apiKey}`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
    if (!searchResponse.ok || !searchData.items) {
        throw new Error(searchData.error?.message || 'Falha ao buscar IDs de vídeos do canal.');
    }
    
    const videoIds = searchData.items.map(item => item.id.videoId).join(',');
    if (!videoIds) return [];

    // Etapa 2: Buscar detalhes e estatísticas de todos os vídeos de uma vez
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${apiKey}`;
    const detailsResponse = await fetch(detailsUrl);
    const detailsData = await detailsResponse.json();
    if (!detailsResponse.ok || !detailsData.items) {
        throw new Error(detailsData.error?.message || 'Falha ao buscar detalhes dos vídeos.');
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
            thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url,
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

// --- Helper para analisar resposta JSON da IA ---
function parseAIResponse(responseText, serviceName) {
    try {
        // Tenta encontrar um objeto JSON dentro de uma string maior (comum com Claude)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        // Se não encontrar, tenta parsear a string inteira
        return JSON.parse(responseText);
    } catch (e) {
        console.error(`[Análise-${serviceName}] Falha ao parsear JSON da IA:`, e);
        console.error(`[Análise-${serviceName}] Texto recebido:`, responseText);
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

    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (!response.ok) {
            console.error('Erro da API Gemini:', result);
            if (response.status === 400 && result.error?.message.includes('API key not valid')) {
                 throw new Error(`A sua Chave de API do Gemini é inválida.`);
            }
            throw new Error(`Erro da API Gemini: ${result.error?.message || response.statusText}`);
        }
        if (result.candidates && result.candidates[0].content && result.candidates[0].content.parts[0].text) {
            return { titles: result.candidates[0].content.parts[0].text, model: model };
        } else {
            console.error('Resposta inesperada da API Gemini:', result);
            throw new Error('A resposta da IA (Gemini) foi bloqueada ou retornou vazia.');
        }
    } catch (error) {
        console.error('Falha ao chamar a API do Gemini:', error);
        throw error;
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
    // Apenas 2 modelos válidos e testados
    const modelMapping = {
        // Modelos Claude válidos e disponíveis
        'claude-3-sonnet-20240229': 'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307': 'claude-3-haiku-20240307',
        // Fallbacks para modelos antigos (caso sejam usados)
        'claude-3-opus-20240229': 'claude-3-sonnet-20240229', // Fallback para Sonnet
        'claude-sonnet-4-20250514': 'claude-3-sonnet-20240229', // Fallback para Sonnet
        'claude-3.5-sonnet-20241022': 'claude-3-sonnet-20240229', // Fallback para Sonnet
        'claude-3.5-haiku-20241022': 'claude-3-haiku-20240307' // Fallback para Haiku
    };
    
    // Apenas 2 modelos válidos: claude-3-sonnet-20240229 e claude-3-haiku-20240307
    // Converter nome do modelo usando mapeamento ou determinar pelo tipo
    let modelName = modelMapping[model];
    
    // Se não estiver no mapeamento, determinar pelo tipo de modelo
    if (!modelName) {
        if (model.includes('haiku')) {
            modelName = 'claude-3-haiku-20240307';
        } else {
            // Padrão: usar Sonnet (para sonnet, opus, ou qualquer outro)
            modelName = 'claude-3-sonnet-20240229';
        }
    }
    
    // Garantir que apenas os 2 modelos válidos sejam usados
    const validModels = ['claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
    if (!validModels.includes(modelName)) {
        // Se por algum motivo o modelo não for válido, usar Sonnet como padrão
        console.warn(`[Claude API] Modelo ${modelName} não é válido, usando claude-3-sonnet-20240229 como padrão`);
        modelName = 'claude-3-sonnet-20240229';
    }
    
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

    const payload = {
        model: modelName,
        system: "Responda APENAS com o objeto JSON solicitado, começando com { e terminando com }.",
        messages: [{ role: "user", content: content }],
        temperature: 0.7,
        max_tokens: 4096,
    };

    try {
        const response = await fetch(CLAUDE_API_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (!response.ok) {
            console.error('Erro da API Claude:', result);
            console.error(`[Claude API] Modelo tentado: ${modelName} (original: ${model})`);
            if (result.error?.type === 'authentication_error') {
                 throw new Error(`A sua Chave de API do Claude é inválvida.`);
            }
            // Mensagem de erro mais detalhada
            const errorMsg = result.error?.message || response.statusText;
            if (errorMsg.includes('model') || errorMsg.includes('invalid') || errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
                // Tentar fallback automático apenas com os 2 modelos válidos
                const validModels = ['claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
                
                // Tentar o outro modelo válido se o atual falhou
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
                throw new Error(`Modelo Claude inválido ou não disponível: ${modelName}. Use um destes modelos válidos: ${validModels.join(' ou ')}. Erro da API: ${errorMsg}`);
            }
            throw new Error(`Erro da API Claude: ${errorMsg}`);
        }
        if (result.content && result.content[0] && result.content[0].text) {
            return { titles: result.content[0].text, model: model };
        } else {
            throw new Error('A resposta da IA (Claude) retornou vazia.');
        }
    } catch (error) {
        console.error('Falha ao chamar a API do Claude:', error);
        throw error;
    }
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
                model: "claude-3-haiku-20240307", // Usar um modelo válido para validação
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
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, channel_id)
            );
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

        console.log('✅ Novas tabelas criadas: Analytics, Biblioteca e Integração YouTube');
        
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

        const validationPromises = keysData.map(async (keyData) => {
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


// === ROTAS DE ANÁLISE (O CORAÇÃO DO SAAS) ===

app.post('/api/analyze/titles', authenticateToken, async (req, res) => {
    const { videoUrl, model, folderId } = req.body;
    const userId = req.user.id;

    if (!videoUrl || !model) {
        return res.status(400).json({ msg: 'URL do vídeo e modelo de IA são obrigatórios.' });
    }
    
    try {
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
        try {
            const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);
            transcriptText = transcriptData.map(t => t.text).join(' ');
        } catch (err) {
            console.warn(`[Análise] Não foi possível obter transcrição para ${videoId}. A continuar sem ela.`);
            transcriptText = "(Transcrição não disponível)";
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
        const performanceContext = videoDetails.days > 0 
            ? `Este vídeo viralizou com ${videoDetails.views.toLocaleString()} views em apenas ${videoDetails.days} dias (média de ${viewsPerDay.toLocaleString()} views/dia) - um desempenho EXCEPCIONAL que indica alta viralização.`
            : `Este vídeo tem ${videoDetails.views.toLocaleString()} views - um desempenho EXCEPCIONAL que indica alta viralização.`;

        const titlePrompt = `
            Você é um ESPECIALISTA EM VIRALIZAÇÃO NO YOUTUBE com experiência comprovada em criar títulos que geram MILHÕES DE VIEWS e ALTO CTR (taxa de cliques acima de 25%). Sua missão é analisar um vídeo que VIRALIZOU e criar variações MUITO CHAMATIVAS focadas em VIRALIZAÇÃO para canais subnichados.

            🚀 CONTEXTO DO VÍDEO VIRAL:
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

            🎯 PROMPT DE ANÁLISE DE TÍTULOS VIRAIS (DIRETO DO VÍDEO VIRAL):
            Este vídeo do canal viralizou, pegou ${videoDetails.views.toLocaleString()} VIEWS EM ${videoDetails.days} DIAS com o título: "${videoDetails.title}"
            
            OBJETIVO: Criar títulos e canais MILIONÁRIOS com MILHÕES DE VIEWS e ALTO CTR (acima de 25%).
            
            Preciso que você me dê variações MUITO CHAMATIVAS focadas em VIRALIZAÇÃO para meu canal subnichado. Cada título deve ter POTENCIAL PARA GERAR MILHÕES DE VIEWS, não apenas alguns milhares. Foque em criar títulos que se tornem virais e gerem engajamento massivo.

            🎯 SUA TAREFA (FOCO EM VIRALIZAÇÃO E MILHÕES DE VIEWS):
            1.  **Análise Profunda de Nicho e Subnicho:** 
                - Identifique o "nicho" exato e o "subniche" específico do vídeo.
                - Analise por que esse subnicho funcionou tão bem e qual o público-alvo que gerou essa viralização.
                - Identifique oportunidades de subnichos pouco explorados com alto potencial de viralização.

            2.  **Análise do Título Viral (Por que funcionou?):** 
                Analise PROFUNDAMENTE o título que viralizou e identifique:
                - Explique o "motivoSucesso" detalhado: Por que esse título específico gerou ${videoDetails.views.toLocaleString()} views em ${videoDetails.days} dias? O que tornou ele tão viral?
                - Identifique a "formulaTitulo" (a estrutura exata, gatilhos mentais, palavras-chave virais, padrões emocionais que fizeram esse título viralizar e gerar milhões de views).
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
            const pClaude = callClaudeAPI(titlePrompt, keys.claude, 'claude-3-sonnet-20240229');
            const pOpenAI = callOpenAIAPI(titlePrompt, keys.openai, 'gpt-4.1');

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
            finalNicheData = { niche: firstSuccessfulAnalysis.niche, subniche: firstSuccessfulAnalysis.subniche };
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
            finalNicheData = { niche: parsedData.niche, subniche: parsedData.subniche };
            finalAnalysisData = parsedData.analiseOriginal;
            allGeneratedTitles = parsedData.titulosSugeridos.map(t => ({ ...t, model: model }));
        }
        // --- FIM DA LÓGICA DO DISTRIBUIDOR ---

        console.log('[Análise] Títulos gerados com sucesso.');

        // --- ETAPA 3: Salvar no Banco de Dados ---
        let analysisId;
        try {
             const analysisResult = await db.run(
                `INSERT INTO analyzed_videos (user_id, folder_id, youtube_video_id, video_url, original_title, translated_title, original_views, original_comments, original_days, original_thumbnail_url, detected_niche, detected_subniche, analysis_data_json) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, folderId || null, videoId, videoUrl, videoDetails.title, translatedTitle, videoDetails.views,
                    videoDetails.comments, videoDetails.days, videoDetails.thumbnailUrl,
                    finalNicheData.niche, finalNicheData.subniche, JSON.stringify(finalAnalysisData) 
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
        const rpm = getRPMByNiche(finalNicheData.niche);
        const views = parseInt(videoDetails.views) || 0;
        const estimatedRevenueUSD = (views / 1000) * rpm.usd;
        const estimatedRevenueBRL = (views / 1000) * rpm.brl;
        const rpmUSD = rpm.usd;
        const rpmBRL = rpm.brl;

        // --- ETAPA 5: Enviar Resposta (com IDs dos títulos, receita e RPM) ---
        const finalTitlesWithIds = await db.all('SELECT id, title_text as titulo, model_used as model, pontuacao, explicacao, is_checked FROM generated_titles WHERE video_analysis_id = ?', [analysisId]);

        // NÃO salvar automaticamente - apenas quando o usuário marcar o checkbox
        // O salvamento será feito quando o usuário marcar o título como selecionado
        console.log(`[Biblioteca] Títulos gerados aguardando seleção do usuário para salvar na biblioteca`);

        res.status(200).json({
            niche: finalNicheData.niche,
            subniche: finalNicheData.subniche,
            analiseOriginal: finalAnalysisData,
            titulosSugeridos: finalTitlesWithIds,
            modelUsed: modelUsedForDisplay, 
            videoDetails: { 
                ...videoDetails, 
                videoId: videoId, 
                translatedTitle: translatedTitle,
                estimatedRevenueUSD: estimatedRevenueUSD,
                estimatedRevenueBRL: estimatedRevenueBRL,
                rpmUSD: rpmUSD,
                rpmBRL: rpmBRL
            },
            folderId: folderId || null
        });

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
            
            // Contexto de performance do vídeo viral
            const videoPerformanceContext = videoDetails.views && videoDetails.days 
                ? `\n            🚀 CONTEXTO DO VÍDEO VIRAL:\n            Esta thumbnail VIRALIZOU junto com o vídeo que alcançou ${videoDetails.views.toLocaleString()} views em apenas ${videoDetails.days} dias (média de ${Math.round(videoDetails.views / Math.max(videoDetails.days, 1)).toLocaleString()} views/dia). Esta thumbnail foi parte do sucesso viral e precisa ser adaptada para o seu subnicho mantendo o mesmo poder de viralização.`
                : `\n            🚀 CONTEXTO DO VÍDEO VIRAL:\n            Esta thumbnail VIRALIZOU junto com o vídeo que alcançou ${videoDetails.views.toLocaleString()} views. Esta thumbnail foi parte do sucesso viral e precisa ser adaptada para o seu subnicho mantendo o mesmo poder de viralização.`;
            
            // Prompts otimizados por modelo
            if (service === 'gemini') {
                thumbPrompt = `
            Você é um ESPECIALISTA EM THUMBNAILS VIRAIS NO YOUTUBE, combinando as habilidades de um diretor de arte profissional e um estrategista de viralização com experiência em criar thumbnails que geram MILHÕES DE VIEWS e ALTO CTR (acima de 25%).${formulaContext}${videoPerformanceContext}

            🎯 PROMPT DE ANÁLISE DE THUMBS (DIRETO DO VÍDEO VIRAL):
            Este vídeo COM ESTA THUMBNAIL VIRALIZOU, com o título: "${videoDetails.title}"
            
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
            } else if (service === 'claude') {
                thumbPrompt = `
            Você é um ESPECIALISTA EM THUMBNAILS VIRAIS NO YOUTUBE, combinando as habilidades de um diretor de arte profissional e um estrategista de viralização com experiência em criar thumbnails que geram MILHÕES DE VIEWS e ALTO CTR (acima de 25%).${formulaContext}${videoPerformanceContext}

            🎯 PROMPT DE ANÁLISE DE THUMBS (DIRETO DO VÍDEO VIRAL):
            Este vídeo COM ESTA THUMBNAIL VIRALIZOU, com o título: "${videoDetails.title}"
            
            OBJETIVO: Criar thumbnails que gerem MILHÕES DE VIEWS e ALTO CTR (acima de 25%) para canais milionários.
            
            Quero que você me dê uma ADAPTAÇÃO para meu SUBNICHO de "${subniche}" com o título: "${selectedTitle}"
            
            REGRAS CRÍTICAS:
            - Mantenha o PODER VIRAL da thumbnail original que gerou milhões de views
            - Adapte para o meu subnicho e título, mas SEMPRE mantenha a capacidade de gerar alto CTR e milhões de views
            - Analise PROFUNDAMENTE o que tornou a thumbnail original viral (composição, cores, elementos visuais, expressões, texto, contraste, psicologia visual)
            - Identifique os ELEMENTOS VIRAIS COMPROVADOS que funcionaram e mantenha-os na adaptação
            - Melhore o que for possível (cores mais vibrantes, contraste maior, composição mais impactante, iluminação mais dramática)
            - Crie thumbnails que TENHAM POTENCIAL PARA VIRALIZAR e gerar milhões de views como a original

            IMAGEM DE REFERÊNCIA: [A imagem da thumbnail original do vídeo VIRAL está anexada - analise cuidadosamente o que tornou esta thumbnail viral e gerou milhões de views]
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
            
            SUA TAREFA (OTIMIZADA PARA VIRALIZAÇÃO - CLAUDE):
            Analise a thumbnail VIRAL de referência e crie DUAS (2) adaptações que mantenham o PODER VIRAL original, mas adaptadas para o subnicho "${subniche}" e o título "${selectedTitle}".
            
            - **IDEIA 1 (Adaptação Estratégica Mantendo o Poder Viral):** 
              Analise PROFUNDAMENTE a thumbnail viral de referência e identifique:
              * O que tornou esta thumbnail viral? (composição, cores, elementos visuais, expressões, texto, contraste, psicologia visual)
              * Quais elementos visuais geraram curiosidade e cliques?
              * Qual foi a estratégia emocional e psicológica que funcionou?
              * Quais micro-expressões, linguagem corporal, ou elementos sutis aumentaram o CTR?
              
              Agora, crie uma ADAPTAÇÃO para o subnicho "${subniche}" e título "${selectedTitle}" que:
              * MANTENHA os elementos virais que funcionaram (composição similar, estratégia emocional, contraste, psicologia visual)
              * ADAPTE os elementos visuais para o seu subnicho (personagens, objetos, cenários relevantes)
              * MELHORE o que for possível (cores mais vibrantes, contraste maior, composição mais impactante, iluminação mais dramática)
              * MANTENHA o mesmo PODER VIRAL da original
              * APRIMORE elementos técnicos: profundidade de campo, iluminação direcional, harmonia cromática, hierarquia visual
              
              O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada (stroke, drop shadow com valores específicos, outer glow, bevel and emboss) e tipografia profissional.
            
            - **IDEIA 2 (Inovação Viral com Elementos do Original):** 
              Crie um conceito COMPLETAMENTE NOVO que:
              * USE os GATILHOS VIRAIS identificados na thumbnail original (curiosidade, FOMO, surpresa, contraste, psicologia visual)
              * ADAPTE para o subnicho "${subniche}" com elementos visuais relevantes e autênticos
              * OTIMIZE para o título "${selectedTitle}" destacando palavras-chave visuais e emocionais
              * SEJA AINDA MAIS IMPACTANTE que a original (cores mais vibrantes, contraste maior, composição mais dramática, iluminação mais intensa)
              * GERE MAIS CURIOSIDADE e CLIQUE que a original
              
              Foque em: 
              * Curiosidade extrema (elementos misteriosos, surpreendentes, inusitados, composições inovadoras)
              * Emoção intensa (expressões faciais dramáticas, micro-expressões, momentos de tensão máxima, storytelling visual)
              * Contraste visual máximo (cores vibrantes vs. fundo neutro, luz vs. sombra dramática, composição em regra dos terços)
              * FOMO máximo (medo de perder algo, urgência visual, exclusividade, escassez)
              * Psicologia visual avançada (elementos que prendem o olhar, pontos focais estratégicos, hierarquia visual clara)
              * Técnicas cinematográficas (profundidade de campo, iluminação direcional, bokeh, composição profissional)
              
              O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada (stroke, drop shadow com valores específicos, outer glow, bevel and emboss) e tipografia profissional.

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
            - Considere aspectos de usabilidade: a thumbnail deve ser legível mesmo em tamanhos pequenos (mobile).
            - Foque em elementos que maximizem CTR: expressões faciais intensas, momentos de tensão, curiosidade visual, contraste dramático, composição impactante.

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
        
        // --- 4. Chamar a API Multimodal ---
        let apiCallFunction;
        if (service === 'gemini') apiCallFunction = callGeminiAPI;
        else if (service === 'claude') apiCallFunction = callClaudeAPI;
        else if (service === 'openai') apiCallFunction = callOpenAIAPI;
        
        console.log(`[Análise-Thumb] A chamar ${service} com o modelo ${model}...`);
        const response = await apiCallFunction(thumbPrompt, decryptedKey, model, videoDetails.thumbnailUrl);

        // --- 5. Enviar resposta ---
        const parsedData = parseAIResponse(response.titles, service);
        if (!parsedData.ideias || !Array.isArray(parsedData.ideias) || parsedData.ideias.length === 0) {
            throw new Error("A IA não retornou o array 'ideias' esperado.");
        }

        // Salvar thumbnails geradas na biblioteca automaticamente
        try {
            for (const ideia of parsedData.ideias) {
                if (ideia.descricaoThumbnail) {
                    await db.run(
                        `INSERT INTO viral_thumbnails_library (user_id, thumbnail_url, thumbnail_description, niche, subniche, original_views, style, viral_score)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [userId, null, ideia.descricaoThumbnail, niche, subniche, videoDetails?.views || null, style, 8] // Score padrão 8 para thumbnails geradas, thumbnail_url como NULL
                    );
                }
            }
            console.log(`[Biblioteca] ${parsedData.ideias.length} thumbnails salvas na biblioteca`);
        } catch (libErr) {
            console.error('[Biblioteca] Erro ao salvar thumbnails na biblioteca:', libErr);
            // Tentar novamente sem thumbnail_url se falhar
            try {
                for (const ideia of parsedData.ideias) {
                    if (ideia.descricaoThumbnail) {
                        await db.run(
                            `INSERT INTO viral_thumbnails_library (user_id, thumbnail_description, niche, subniche, original_views, style, viral_score)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [userId, ideia.descricaoThumbnail, niche, subniche, videoDetails?.views || null, style, 8]
                        );
                    }
                }
                console.log(`[Biblioteca] ${parsedData.ideias.length} thumbnails salvas na biblioteca (segunda tentativa)`);
            } catch (retryErr) {
                console.error('[Biblioteca] Erro persistente ao salvar thumbnails:', retryErr);
            }
        }

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
        const enhancedPrompt = `${prompt}, photorealistic, hyperrealistic, cinematic, 8k, ultra high definition, sharp focus, professional photography, taken with a high-end camera like a Sony α7 IV, detailed skin texture, natural lighting`;
        
        const images = await imageFx.generateImage(enhancedPrompt, {
            numberOfImages: 1,
            aspectRatio: AspectRatio.LANDSCAPE 
        });

        if (!images || images.length === 0) {
            throw new Error('O ImageFX não retornou imagens.');
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
            libraryId: savedId
        });

    } catch (err) {
        console.error('[ERRO NA ROTA /api/generate/imagefx]:', err);
        res.status(500).json({ msg: err.message || 'Erro interno do servidor ao gerar imagem.' });
    }
});


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
        
        const total = totalResult?.total || 0;
        const totalPages = Math.ceil(total / limitNum);
        
        res.status(200).json({
            data: history,
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

        // Fetch latest, popular, and pinned videos
        const [latestVideos, popularVideos, pinnedVideoIds] = await Promise.all([
            getChannelVideosWithDetails(ytChannelId, geminiApiKey, 'date', 5),
            getChannelVideosWithDetails(ytChannelId, geminiApiKey, 'viewCount', 5),
            db.all('SELECT id, youtube_video_id FROM pinned_videos WHERE user_id = ? AND monitored_channel_id = ? ORDER BY pinned_at DESC', [userId, channelId])
        ]);

        let pinnedVideos = [];
        if (pinnedVideoIds.length > 0) {
            const idsToFetch = pinnedVideoIds.map(p => p.youtube_video_id).join(',');
            const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${idsToFetch}&key=${geminiApiKey}`;
            const detailsResponse = await fetch(detailsUrl);
            const detailsData = await detailsResponse.json();
            if (detailsResponse.ok && detailsData.items) {
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
                        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url,
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
        
        await db.run('UPDATE monitored_channels SET last_checked = CURRENT_TIMESTAMP WHERE id = ?', [channelId]);
        
        res.status(200).json({
            latest: latestVideos,
            popular: popularVideos,
            pinned: pinnedVideos
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
        let stats;
        try {
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
            `, [userId]);
            console.log(`[Analytics Dashboard] Stats encontrados:`, stats);
        } catch (dbErr) {
            console.error('[Analytics Dashboard] Erro ao buscar stats:', dbErr);
            stats = {
                total_videos: 0,
                total_views: 0,
                total_likes: 0,
                total_comments: 0,
                avg_ctr: 0,
                total_revenue: 0,
                viral_videos: 0
            };
        }

        let recentVideos = [];
        try {
            recentVideos = await db.all(`
                SELECT vt.id, vt.youtube_video_id, vt.title_used, vt.actual_views, vt.actual_ctr, vt.revenue_estimate, 
                       vt.published_at, vt.tracked_at, vt.channel_id, uc.channel_name
                FROM video_tracking vt
                LEFT JOIN user_channels uc ON vt.channel_id = uc.id
                WHERE vt.user_id = ?
                ORDER BY COALESCE(vt.published_at, vt.tracked_at) DESC
                LIMIT 50
            `, [userId]);
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
            recentVideos: recentVideos || []
        };

        console.log(`[Analytics Dashboard] Enviando resposta:`, JSON.stringify(response).substring(0, 200));
        res.status(200).json(response);
    } catch (err) {
        console.error('[ERRO NA ROTA /api/analytics/dashboard]:', err);
        // Retornar dados vazios em caso de erro (tabela pode não existir ainda)
        // Função helper para RPM padrão
        const getDefaultRPM = () => ({ usd: 2.0, brl: 11.0 });
        const defaultRPM = getDefaultRPM();
        res.status(200).json({
            stats: {
                totalVideos: 0,
                totalViews: 0,
                totalLikes: 0,
                totalComments: 0,
                avgCtr: 0,
                totalRevenue: 0,
                totalRevenueBRL: 0,
                rpmUSD: defaultRPM.usd,
                rpmBRL: defaultRPM.brl,
                viralVideos: 0
            },
            recentVideos: []
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

        res.status(200).json(titles || []);
    } catch (err) {
        console.error('[ERRO NA ROTA /api/library/titles]:', err);
        // Retornar array vazio se a tabela não existir
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

        res.status(200).json(thumbnails || []);
    } catch (err) {
        console.error('[ERRO NA ROTA /api/library/thumbnails]:', err);
        // Retornar array vazio se a tabela não existir
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
    // Para produção, você precisa configurar OAuth 2.0 do Google
    // Por enquanto, retornamos instruções
    const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || 'YOUR_CLIENT_ID';
    const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:5001/api/youtube/oauth/callback';
    const SCOPE = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPE)}&access_type=offline&prompt=consent`;

    res.status(200).json({ authUrl, msg: 'Use esta URL para autorizar o acesso ao YouTube.' });
});

// Callback OAuth (será chamado pelo Google após autorização)
app.get('/api/youtube/oauth/callback', authenticateToken, async (req, res) => {
    const { code } = req.query;
    const userId = req.user.id;

    if (!code) {
        return res.status(400).json({ msg: 'Código de autorização não fornecido.' });
    }

    // Trocar code por access_token e refresh_token
    // Em produção, implemente a troca do código OAuth
    res.status(200).json({ msg: 'Integração configurada. Implementar troca de código OAuth.' });
});

// Agendar publicação de vídeo
app.post('/api/youtube/schedule', authenticateToken, async (req, res) => {
    const { youtubeIntegrationId, videoFilePath, title, description, tags, thumbnailUrl, scheduledTime } = req.body;
    const userId = req.user.id;

    if (!title || !scheduledTime) {
        return res.status(400).json({ msg: 'Título e horário agendado são obrigatórios.' });
    }

    try {
        const result = await db.run(
            `INSERT INTO scheduled_posts (user_id, youtube_integration_id, video_file_path, title, description, tags, thumbnail_url, scheduled_time)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, youtubeIntegrationId || null, videoFilePath || null, title, description || null, tags ? JSON.stringify(tags) : null, thumbnailUrl || null, scheduledTime]
        );
        res.status(201).json({ id: result.lastID, msg: 'Publicação agendada com sucesso.' });
    } catch (err) {
        console.error('[ERRO NA ROTA /api/youtube/schedule]:', err);
        res.status(500).json({ msg: 'Erro ao agendar publicação.' });
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