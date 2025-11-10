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

    // Etapa 3: Mapear e formatar os dados
    return detailsData.items.map(item => {
        const uploadDate = new Date(item.snippet.publishedAt);
        const daysPosted = Math.round((new Date() - uploadDate) / (1000 * 60 * 60 * 24));
        return {
            videoId: item.id,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url,
            publishedAt: item.snippet.publishedAt,
            views: item.statistics.viewCount || 0,
            likes: item.statistics.likeCount || 0,
            comments: item.statistics.commentCount || 0,
            days: daysPosted
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
                channel_url TEXT NOT NULL UNIQUE,
                last_checked DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
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

        // --- INICIAR SERVIDOR ---
        app.listen(PORT, () => {
            console.log(`Servidor "La Casa Dark Core" a rodar na porta ${PORT}`);
        });

    } catch (err) {
        console.error('Erro ao conectar ou inicializar o banco de dados:', err);
    }
})();


// --- ROTAS DE API ---

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
        const titlePrompt = `
            Você é um especialista em SEO para YouTube e estrategista de conteúdo viral. Sua tarefa é analisar os dados de um vídeo que viralizou e, com base nisso, criar novos títulos otimizados EM PORTUGUÊS BRASILEIRO (PT-BR).

            DADOS DO VÍDEO ORIGINAL:
            - Título Original (traduzido para PT-BR): "${translatedTitle}"
            - Título Original (idioma original): "${videoDetails.title}"
            - Estatísticas: ${videoDetails.views} visualizações, ${videoDetails.comments} comentários, postado há ${videoDetails.days} dias.
            - Descrição (início): ${videoDetails.description.substring(0, 300)}...
            - Transcrição (início): ${transcriptText.substring(0, 500)}...

            SUA TAREFA:
            1.  **Análise de Nicho:** Identifique o "nicho" e o "subniche" do vídeo.
            2.  **Análise do Título Original:** Explique o "motivoSucesso" do título original e identifique a "formulaTitulo" (a estrutura ou gatilho mental usado).
            3.  **Geração de Novos Títulos:** Usando a "formulaTitulo" que você identificou como base, crie 5 novas variações de títulos EM PORTUGUÊS BRASILEIRO (PT-BR) com melhorias para um vídeo com tema similar. Para cada novo título, forneça:
                - "titulo": O novo título EM PORTUGUÊS BRASILEIRO (PT-BR).
                - "pontuacao": Uma nota de 0 a 10, avaliando o potencial viral.
                - "explicacao": Uma breve justificativa para a nota e a estratégia por trás do título EM PORTUGUÊS BRASILEIRO.

            REGRAS IMPORTANTES:
            - TODOS os títulos sugeridos DEVEM estar em PORTUGUÊS BRASILEIRO (PT-BR).
            - A "explicacao" de cada título também deve estar em PORTUGUÊS BRASILEIRO.
            - Mantenha o impacto, curiosidade e gatilhos mentais do título original.

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

        // --- ETAPA 4: Enviar Resposta (com IDs dos títulos) ---
        const finalTitlesWithIds = await db.all('SELECT id, title_text as titulo, model_used as model, pontuacao, explicacao, is_checked FROM generated_titles WHERE video_analysis_id = ?', [analysisId]);

        res.status(200).json({
            niche: finalNicheData.niche,
            subniche: finalNicheData.subniche,
            analiseOriginal: finalAnalysisData,
            titulosSugeridos: finalTitlesWithIds,
            modelUsed: modelUsedForDisplay, 
            videoDetails: { ...videoDetails, videoId: videoId, translatedTitle: translatedTitle },
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
        // Atualiza o status do título específico, sem afetar os outros
        const result = await db.run(
            `UPDATE generated_titles SET is_checked = ? 
             WHERE id = ? AND video_analysis_id IN (SELECT id FROM analyzed_videos WHERE user_id = ?)`,
            [is_checked, titleId, userId]
        );

        if (result.changes === 0) {
            return res.status(404).json({ msg: 'Título não encontrado ou não pertence a este utilizador.' });
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
            
            // Prompts otimizados por modelo
            if (service === 'gemini') {
                thumbPrompt = `
            Você é um especialista em YouTube, combinando as habilidades de um diretor de arte para thumbnails e um mestre de SEO.${formulaContext}

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
            
            SUA TAREFA (OTIMIZADA PARA GEMINI):
            Crie DUAS (2) ideias distintas para uma nova thumbnail que maximizem o CTR (taxa de cliques).
            - **IDEIA 1 (Melhoria Estratégica):** Analise a thumbnail de referência e proponha uma versão melhorada que mantenha a essência do que funcionou, mas aprimore: composição visual (regra dos terços, hierarquia visual), contraste de cores (cores complementares, saturação otimizada), expressões faciais ou elementos emocionais, e clareza do elemento principal. LEMBRE-SE: Deve ser descrito como uma FOTO REAL, não uma ilustração. O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada (stroke, drop shadow com valores específicos, outer glow, bevel and emboss) e tipografia profissional.
            - **IDEIA 2 (Inovação Viral):** Crie um conceito completamente novo e mais otimizado, usando um ângulo diferente para atrair cliques. Foque em: curiosidade (elementos misteriosos ou surpreendentes), emoção (expressões faciais intensas, momentos de tensão), contraste visual (cores vibrantes vs. fundo neutro), e elementos que gerem "FOMO" (medo de perder algo). LEMBRE-SE: Deve ser descrito como uma FOTO REAL, não uma ilustração. O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada (stroke, drop shadow com valores específicos, outer glow, bevel and emboss) e tipografia profissional.

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
            
            SUA TAREFA (OTIMIZADA PARA CLAUDE):
            Crie DUAS (2) ideias distintas para uma nova thumbnail que maximizem o engajamento e CTR.
            - **IDEIA 1 (Melhoria Estratégica):** Analise profundamente a thumbnail de referência e proponha uma versão melhorada que mantenha a essência do que funcionou, mas aprimore: composição visual (regra dos terços, hierarquia visual, pontos focais), contraste de cores (cores complementares, saturação otimizada, harmonia cromática), expressões faciais ou elementos emocionais (micro-expressões, linguagem corporal), e clareza do elemento principal (profundidade de campo, iluminação direcional). O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada (stroke, drop shadow com valores específicos, outer glow, bevel and emboss) e tipografia profissional.
            - **IDEIA 2 (Inovação Viral):** Crie um conceito completamente novo e mais otimizado, usando um ângulo diferente para atrair cliques. Foque em: curiosidade (elementos misteriosos ou surpreendentes, composições inusitadas), emoção (expressões faciais intensas, momentos de tensão, storytelling visual), contraste visual (cores vibrantes vs. fundo neutro, luz vs. sombra), e elementos que gerem "FOMO" (medo de perder algo, urgência visual). O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada (stroke, drop shadow com valores específicos, outer glow, bevel and emboss) e tipografia profissional.

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
            
            SUA TAREFA (OTIMIZADA PARA GPT):
            Crie DUAS (2) ideias distintas para uma nova thumbnail que maximizem o CTR e engajamento.
            - **IDEIA 1 (Melhoria Estratégica):** Analise a thumbnail de referência e proponha uma versão melhorada que mantenha a essência do que funcionou, mas aprimore: composição visual (regra dos terços, hierarquia visual, pontos focais), contraste de cores (cores complementares, saturação otimizada), expressões faciais ou elementos emocionais, e clareza do elemento principal. O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada (stroke, drop shadow com valores específicos, outer glow, bevel and emboss) e tipografia profissional.
            - **IDEIA 2 (Inovação Viral):** Crie um conceito completamente novo e mais otimizado, usando um ângulo diferente para atrair cliques. Foque em: curiosidade (elementos misteriosos ou surpreendentes), emoção (expressões faciais intensas, momentos de tensão), contraste visual (cores vibrantes vs. fundo neutro), e elementos que gerem "FOMO" (medo de perder algo). O TEXTO DEVE ter qualidade profissional como se fosse feito no Photoshop por um designer experiente, com múltiplos efeitos de camada (stroke, drop shadow com valores específicos, outer glow, bevel and emboss) e tipografia profissional.

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
        res.status(200).json(parsedData.ideias);

    } catch (err) {
        console.error('[ERRO NA ROTA /api/analyze/thumbnail]:', err);
        res.status(500).json({ msg: err.message || 'Erro interno do servidor ao gerar ideias de thumbnail.' });
    }
});


// === ROTA PARA GERAR IMAGEM COM IMAGEFX ===
app.post('/api/generate/imagefx', authenticateToken, async (req, res) => {
    const { prompt } = req.body;
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

        res.status(200).json({ 
            msg: 'Imagem gerada com sucesso!',
            imageUrl: images[0].getImageData().url
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
        const prompt = `Quero criar um canal no YouTube dentro do nicho de "${nichePrincipal}", inicialmente pensei em abordar "${ideiaInicial}", mas percebi que já há bastante concorrência nesse subnicho. Estou em busca de uma ideia de subnicho dentro de "${nichePrincipal}" que ainda esteja pouco explorada no YouTube, com pouca ou nenhuma concorrência, mas que tenha alto volume de buscas, interesse crescente e bom potencial de monetização. O objetivo é encontrar uma oportunidade única para criar conteúdo relevante, com forte demanda e baixa competição. Com base em dados atuais e tendências, o que você recomenda?`;

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

        // 4. Construir o PROMPT 2
        const prompt = `
            GPT, preciso da sua ajuda para analisar um canal de sucesso no YouTube e usar essa análise como base para a criação do meu próprio canal dentro do mesmo nicho.
            Vou te fornecer as seguintes informações:
            ${videoDataForPrompt}
            
            Com base nesses dados, preciso que você faça uma análise profunda e me responda com:
            - Qual é o nicho exato desse canal e seu subnicho (se houver)?
            - Quais são os principais diferenciais que tornam esse canal bem-sucedido?
            - Qual é o público-alvo (perfil demográfico, interesses, comportamento)?
            - Quais estratégias de conteúdo parecem ser as mais eficazes (tipo de vídeo, frequência, estilo de narrativa, títulos, miniaturas, SEO)?
            - Quais padrões ou formatos se repetem nos vídeos de maior sucesso?
            - Há algo nos comentários que revele desejos ou insatisfações da audiência que eu possa usar como oportunidade? (Simule uma análise de sentimentos com base nos títulos e views)
            - Quais são as oportunidades que eu posso explorar para criar um canal similar, porém com diferenciais competitivos?
            
            Ao final, quero que você me oriente sobre:
            - Como devo estruturar o conteúdo do meu canal.
            - Qual linha editorial devo seguir.
            - Sugestões de nome de canal, temas iniciais e identidade visual.
            - E se possível, ideias de roteiros para os primeiros vídeos, baseados no que mais funciona no canal analisado.
            
            Analise tudo com atenção e me dê uma resposta estratégica e prática, voltada para resultados, em formato JSON. O JSON deve ter chaves como "analise_nicho", "diferenciais_sucesso", "publico_alvo", "estrategias_conteudo", "padroes_videos", "analise_comentarios", "oportunidades_explorar", e "orientacoes_finais" (que por sua vez contém "estrutura_conteudo", "linha_editorial", "sugestoes_branding", "ideias_roteiros").
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
    const { folderId } = req.query;
    
    try {
        let query;
        let params;
        
        if (folderId) {
            query = 'SELECT id, original_title, detected_subniche, analyzed_at FROM analyzed_videos WHERE user_id = ? AND folder_id = ? ORDER BY analyzed_at DESC';
            params = [userId, folderId];
        } else {
            query = 'SELECT id, original_title, detected_subniche, analyzed_at FROM analyzed_videos WHERE user_id = ? AND folder_id IS NULL ORDER BY analyzed_at DESC';
            params = [userId];
        }
        
        const history = await db.all(query, params);
        res.status(200).json(history);
        
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

        const responseData = {
            niche: analysis.detected_niche,
            subniche: analysis.detected_subniche,
            analiseOriginal: JSON.parse(analysis.analysis_data_json || '{}'),
            titulosSugeridos: titles,
            modelUsed: titles.length > 0 ? titles[0].model : 'Carregado',
            videoDetails: {
                title: analysis.original_title,
                translatedTitle: analysis.translated_title || null,
                views: analysis.original_views,
                comments: analysis.original_comments,
                days: analysis.original_days,
                thumbnailUrl: analysis.original_thumbnail_url, // Corrigido
                videoId: analysis.youtube_video_id
            },
            originalVideoUrl: analysis.video_url 
        };
        res.status(200).json(responseData);

    } catch (err) {
        console.error('Erro ao carregar análise:', err);
        res.status(500).json({ msg: 'Erro no servidor ao carregar análise.' });
    }
});


// === ROTAS DE CANAIS MONITORADOS ===

app.post('/api/channels', authenticateToken, async (req, res) => {
    const { channelUrl, channelName } = req.body;
    const userId = req.user.id;

    if (!channelUrl || !channelName) {
        return res.status(400).json({ msg: 'Nome e URL do canal são obrigatórios.' });
    }

    try {
        const result = await db.run(
            'INSERT INTO monitored_channels (user_id, channel_name, channel_url) VALUES (?, ?, ?)',
            [userId, channelName, channelUrl]
        );
        res.status(201).json({ id: result.lastID, channel_name: channelName, channel_url: channelUrl });
    } catch (err) {
        console.error('Erro ao adicionar canal:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ msg: 'Este canal já está sendo monitorado.' });
        }
        res.status(500).json({ msg: 'Erro no servidor ao adicionar canal.' });
    }
});

app.get('/api/channels', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const channels = await db.all(
            'SELECT id, channel_name, channel_url, last_checked FROM monitored_channels WHERE user_id = ? ORDER BY channel_name',
            [userId]
        );
        res.status(200).json(channels);
    } catch (err) {
        console.error('Erro ao listar canais:', err);
        res.status(500).json({ msg: 'Erro no servidor ao listar canais.' });
    }
});

app.delete('/api/channels/:channelId', authenticateToken, async (req, res) => {
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

app.get('/api/channels/:channelId/check', authenticateToken, async (req, res) => {
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

        const match = channel.channel_url.match(/youtube\.com\/(?:@([\w.-]+)|channel\/([\w-]+))/);
        if (!match) {
            return res.status(400).json({ msg: 'Formato de URL do canal não suportado. Use o formato com @handle ou /channel/ID.' });
        }
        
        let ytChannelId;
        const handle = match[1];
        const legacyId = match[2];

        if (handle) {
            const originalHandle = handle;
            const searchApiUrl = `https://www.googleapis.com/youtube/v3/search?part=id&q=${handle}&type=channel&maxResults=1&key=${geminiApiKey}`;
            const searchResponse = await fetch(searchApiUrl);
            const searchData = await searchResponse.json();

            if (!searchResponse.ok || !searchData.items || searchData.items.length === 0) {
                console.error(`[YouTube API] Falha ao buscar canal por handle via search: ${handle}`, searchData);
                throw new Error(`Não foi possível encontrar o canal para o handle: @${originalHandle}. Verifique se o URL está correto.`);
            }
            ytChannelId = searchData.items[0].id.channelId;
        } else {
            ytChannelId = legacyId;
        }

        if (!ytChannelId) {
             return res.status(400).json({ msg: 'Não foi possível determinar o ID do canal a partir da URL.' });
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
        }

        await db.run('UPDATE monitored_channels SET last_checked = CURRENT_TIMESTAMP WHERE id = ?', [channelId]);
        
        res.status(200).json({
            latest: latestVideos,
            popular: popularVideos,
            pinned: pinnedVideos
        });

    } catch (err) {
        console.error('Erro ao verificar vídeos do canal:', err);
        res.status(500).json({ msg: err.message });
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
        if (count.count >= 5) {
            return res.status(400).json({ msg: 'Limite de 5 vídeos fixados por canal atingido.' });
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