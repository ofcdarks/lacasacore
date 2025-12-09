## Objetivo
- Habilitar transcrição de vídeos 100% no servidor (VPS), sem exigir instalação no computador do usuário.
- Substituir o aviso de instalação local por processamento automático no backend.

## Estratégia de Transcrição
- **Fallback hierárquico**:
  1) Legendas do YouTube (quando disponíveis)
  2) Transcrição por modelo local **Faster‑Whisper** (servidor)
  3) Opcional: API externa (OpenAI/gpt‑4o‑mini‑transcribe) se o admin habilitar
- **Escolha padrão**: Faster‑Whisper (alto desempenho e custo zero em produção)

## Arquitetura
- **Microserviço de transcrição** (Python):
  - Framework leve (FastAPI) expondo `POST /transcribe` com parâmetros: `audio_path`, `language?`, `model_size? (base/small/medium/large-v3)`.
  - Usa `faster_whisper` para inferência; retorna `{ text, segments, language, duration }`.
  - Suporta CPU e GPU (CUDA) se disponível.
- **Backend Node (server.js)**:
  - Nova função `generateServerTranscript(videoId)`:
    - Baixa áudio com `ytdl` → `.mp3`/`.wav` via FFmpeg (TEMP_DIR)
    - Chama microserviço `POST /transcribe` com `audio_path`
    - Normaliza saída; apaga arquivo temporário
  - Rota `POST /api/video/transcript/generate` (interna): chama `generateServerTranscript`, salva em DB (campo `full_transcript` já existe em analyzed_videos)
  - Atualizar `/api/video/transcript/analyze` para:
    - Tentar YouTube captions
    - Se falhar, chamar `generateServerTranscript` e prosseguir
  - SSE de progresso reutilizando `sseClients`: estados “Baixando áudio”, “Transcrevendo…”, “Normalizando…”

## Configuração do VPS (Admin‑Only)
- Instalar dependências (sem expor ao usuário final):
  - Python 3.10+ e pip
  - `pip install faster-whisper fastapi uvicorn`
  - FFmpeg já presente (o projeto configura paths)
  - Opcional GPU: `pip install --upgrade ctranslate2` e CUDA/cuDNN
- Processo:
  - Executar microserviço: `uvicorn transcriber:app --host 127.0.0.1 --port 8060`
  - Backend chama `http://127.0.0.1:8060/transcribe`

## Frontend (UX)
- Remover dicas de “instalar Whisper local”; substituir por mensagens:
  - “Transcrevendo no servidor…” com barra de progresso
  - “Sem legendas? O servidor transcreve automaticamente”
- Nenhuma informação técnica mostrada ao usuário final

## Segurança & Operação
- Limitar tamanho do áudio e tempo de transcrição (timeout)
- Apagar temporários e registrar métricas (duração, idioma)
- Cache: não retranscrever se já existir `full_transcript` no histórico

## Validação
- Vídeos com e sem legendas do YouTube
- Cenários longos (≥30 min) e curtos
- Teste em CPU e (se disponível) GPU

## Próximos Passos
- Implementar microserviço + rotas/fallback no backend
- Atualizar UI de transcrição para esconder instruções técnicas e mostrar progresso server‑side