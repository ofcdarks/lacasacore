# 🚀 Configuração do Whisper Local (Open-Source)

## Visão Geral

Esta solução permite transcrever vídeos usando **Whisper local** (open-source), sem necessidade de API Key da OpenAI. É ideal para VPS e ambientes de produção onde você quer controle total e economia de custos.

## 📋 Pré-requisitos

### 1. Instalar Whisper Local

```bash
pip install openai-whisper
```

### 2. Verificar Instalação

```bash
whisper --help
```

Se aparecer a ajuda, está instalado corretamente ✅

### 3. Dependências Node.js (já instaladas)

- `axios` - Para baixar vídeos diretos
- `@ffprobe-installer/ffprobe` - FFprobe para análise de mídia
- `fluent-ffmpeg` - Para processamento de áudio/vídeo
- `@ffmpeg-installer/ffmpeg` - FFmpeg para conversão

## 🔧 Como Funciona

### Fluxo de Transcrição

1. **Download do Vídeo**
   - YouTube: Usa `ytdl-core` ou `yt-dlp` (fallback)
   - URLs diretas: Usa `axios` para baixar o arquivo

2. **Extração de Áudio**
   - Converte vídeo para áudio WAV (16kHz, mono)
   - Formato otimizado para Whisper

3. **Transcrição Local**
   - Executa Whisper local via `execSync`
   - Modelo: `base` (equilíbrio entre velocidade e qualidade)
   - Idioma: Português (`pt`)

4. **Limpeza**
   - Remove arquivos temporários automaticamente

## 📡 Endpoints

### GET `/api/transcribe`

Transcreve vídeo por URL usando Whisper local.

**Parâmetros:**
- `url` (query string, obrigatório): URL do vídeo

**Exemplos:**

```javascript
// YouTube
GET /api/transcribe?url=https://www.youtube.com/watch?v=XXXXX

// Vídeo direto (MP4)
GET /api/transcribe?url=https://meusite.com/video.mp4
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "text": "Transcrição completa do vídeo...",
  "source": "whisper-local"
}
```

**Resposta de Erro:**
```json
{
  "error": "Falha ao transcrever vídeo",
  "msg": "Mensagem de erro detalhada",
  "hint": "Instale Whisper com: pip install openai-whisper"
}
```

## 🎯 Modelos Disponíveis

O Whisper oferece vários modelos. Por padrão, usamos `base`:

- `tiny` - Mais rápido, menor qualidade
- `base` - **Padrão** - Equilíbrio ideal
- `small` - Melhor qualidade, mais lento
- `medium` - Alta qualidade
- `large` - Melhor qualidade, mais lento

Para alterar o modelo, edite a linha em `server.js`:

```javascript
const command = `whisper "${audioPath}" --model base --language pt --output_format txt --output_dir "${outputDir}"`;
```

## ⚙️ Configuração Avançada

### Timeout de Download

Por padrão, o timeout é de 5 minutos (300000ms). Para alterar:

```javascript
const response = await axios.get(videoUrl, { 
    responseType: 'arraybuffer',
    timeout: 300000 // Ajuste conforme necessário
});
```

### Formato de Áudio

O áudio é extraído em WAV, 16kHz, mono (otimizado para Whisper). Para alterar:

```javascript
ffmpeg(tempVideo)
    .noVideo()
    .audioCodec('pcm_s16le')
    .audioChannels(1)
    .audioFrequency(16000) // Ajuste se necessário
    .save(tempAudio)
```

## 🐛 Troubleshooting

### Erro: "Whisper local não está instalado"

**Solução:**
```bash
pip install openai-whisper
```

### Erro: "Command not found: whisper"

**Solução:**
- Verifique se Python está no PATH
- Use `python -m whisper` ao invés de `whisper`
- Ou instale globalmente: `pip install --user openai-whisper`

### Erro: "FFmpeg não encontrado"

**Solução:**
- O `@ffmpeg-installer/ffmpeg` já instala automaticamente
- Se persistir, instale FFmpeg manualmente no sistema

### Transcrição muito lenta

**Soluções:**
1. Use modelo menor: `--model tiny`
2. Reduza qualidade do áudio (menos frequência)
3. Considere usar GPU (CUDA) se disponível

### Erro de memória

**Soluções:**
1. Use modelo menor (`tiny` ou `base`)
2. Processe vídeos menores
3. Aumente memória da VPS

## 💡 Vantagens do Whisper Local

✅ **Sem API Key** - Não precisa de chave da OpenAI  
✅ **Offline** - Funciona sem internet (após download)  
✅ **Econômico** - Sem custos por requisição  
✅ **Privacidade** - Dados não saem do servidor  
✅ **Controle Total** - Você controla o modelo e configurações  

## 📊 Comparação: Whisper Local vs OpenAI API

| Aspecto | Whisper Local | OpenAI API |
|--------|---------------|------------|
| Custo | Grátis | Pago por minuto |
| Velocidade | Depende do hardware | Rápido (cloud) |
| Privacidade | 100% local | Dados enviados |
| Requisitos | Python + Whisper | Apenas API Key |
| Qualidade | Mesma (mesmo modelo) | Mesma (mesmo modelo) |

## 🔐 Segurança

- A rota requer autenticação (`authenticateToken`)
- Arquivos temporários são limpos automaticamente
- Timeout de 5 minutos para downloads
- Validação de URL antes de processar

## 📝 Notas Importantes

1. **Primeira execução**: O Whisper baixa o modelo na primeira vez (pode demorar)
2. **Espaço em disco**: Modelos ocupam espaço (base ~150MB)
3. **CPU/GPU**: Processamento é intensivo, considere hardware adequado
4. **Tempo**: Transcrições podem levar minutos dependendo do tamanho do vídeo

## 🚀 Próximos Passos

1. Instale o Whisper: `pip install openai-whisper`
2. Teste a rota: `GET /api/transcribe?url=SEU_VIDEO`
3. Ajuste o modelo conforme necessário
4. Configure timeout e limites conforme seu ambiente

---

**Desenvolvido para La Casa Dark Core** 🏠

