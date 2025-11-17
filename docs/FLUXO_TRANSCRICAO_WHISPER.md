# 🎙️ Fluxo de Transcrição com Whisper

## 📋 Processo Completo

O sistema de transcrição segue exatamente este fluxo:

```
1. Baixar áudio (ytdl-core)
   ↓
2. Extrair áudio (FFmpeg)
   ↓
3. Transcrever (OpenAI Whisper)
   ↓
4. Retornar transcrição
```

## 🔧 Implementação Atual

### 1️⃣ Baixar Áudio com ytdl-core

**Função:** `downloadAndExtractAudio(videoId)`

```javascript
// Baixar stream de áudio do YouTube
const stream = ytdl(videoUrl, {
    quality: 'highestaudio',
    filter: 'audioonly'
});
```

**Localização:** `Backend/server.js` linha ~3296

### 2️⃣ Extrair Áudio com FFmpeg

**Função:** `downloadAndExtractAudio(videoId)` (continuação)

```javascript
// Converter para MP3 usando FFmpeg
ffmpeg(stream)
    .audioCodec('libmp3lame')
    .noVideo() // Garantir que só processa áudio
    .save(audioPath);
```

**Localização:** `Backend/server.js` linha ~3302

**FFmpeg instalado automaticamente via:** `@ffmpeg-installer/ffmpeg`

### 3️⃣ Transcrever via OpenAI Whisper

**Função:** `transcribeWithWhisper(audioPath, userId)`

```javascript
const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    language: 'pt'
});
```

**Localização:** `Backend/server.js` linha ~3364

## 🔄 Fluxo Completo na Prática

**Função Principal:** `transcribeVideoWithWhisper(videoId, userId)`

```javascript
async function transcribeVideoWithWhisper(videoId, userId) {
    // 1. Baixar e extrair áudio (ytdl-core + FFmpeg)
    audioPath = await downloadAndExtractAudio(videoId);
    
    // 2. Transcrever com Whisper
    const transcript = await transcribeWithWhisper(audioPath, userId);
    
    return transcript;
}
```

**Localização:** `Backend/server.js` linha ~3400

## 📊 Logs do Processo

Quando você clica em "Carregar Transcrição", você verá no console:

```
[Whisper] ⏳ Baixando áudio do vídeo: VIDEO_ID
[Whisper] FFmpeg iniciado...
[Whisper] Progresso: 25%
[Whisper] Progresso: 50%
[Whisper] Progresso: 75%
[Whisper] ✅ Áudio extraído com sucesso: caminho/arquivo.mp3
[Whisper] 🧠 Enviando para transcrição (Whisper)...
[Whisper] ✅ Transcrição concluída! Tamanho: XXXX caracteres
[Whisper] Arquivo temporário removido: caminho/arquivo.mp3
```

## ✅ Status da Implementação

- ✅ **ytdl-core**: Implementado (usa `@distube/ytdl-core` - mais confiável)
- ✅ **FFmpeg**: Implementado (instalado via `@ffmpeg-installer/ffmpeg`)
- ✅ **OpenAI Whisper**: Implementado (modelo `whisper-1`)

## 🔍 Onde Está no Código

| Etapa | Função | Arquivo | Linha |
|-------|--------|---------|-------|
| 1. Download | `downloadAndExtractAudio()` | `Backend/server.js` | ~3287 |
| 2. FFmpeg | `downloadAndExtractAudio()` | `Backend/server.js` | ~3302 |
| 3. Whisper | `transcribeWithWhisper()` | `Backend/server.js` | ~3339 |
| Fluxo completo | `transcribeVideoWithWhisper()` | `Backend/server.js` | ~3400 |

## 🚀 Como Usar

1. **Configure a chave OpenAI** nas configurações da ferramenta
2. **Clique em "Carregar Transcrição"** em um vídeo analisado
3. **Aguarde o processamento** (pode demorar alguns minutos)
4. **A transcrição aparecerá** na interface

## ⚙️ Requisitos

- ✅ `@distube/ytdl-core` - Instalado
- ✅ `@ffmpeg-installer/ffmpeg` - Instalado automaticamente
- ✅ `openai` - Instalado
- ✅ Chave de API OpenAI - Configurar nas configurações

## 📝 Notas

- Arquivos temporários são **automaticamente limpos** após a transcrição
- O processo funciona mesmo se o vídeo **não tiver legendas** no YouTube
- Timeout de **10 minutos** para evitar travamentos
- Suporta vídeos de **qualquer duração** (limitado pelo timeout)

