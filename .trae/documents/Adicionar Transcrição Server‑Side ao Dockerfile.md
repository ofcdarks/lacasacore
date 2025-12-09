## Opção Recomendada: Dois containers (backend + transcriber)
- Criar um serviço separado de transcrição para manter processos isolados e saúde do container.
- Arquivos:
  - Backend/Dockerfile (já existe): mantém Node + ffmpeg
  - Transcriber/Dockerfile (novo): instala Python, Faster‑Whisper e inicia FastAPI/uvicorn
  - docker-compose.yml: sobe `backend` e `transcriber`; o backend usa `TRANSCRIBER_URL=http://transcriber:8060`
- Transcriber/Dockerfile (exemplo):
  ```Dockerfile
  FROM python:3.10-slim
  RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
  RUN pip install --no-cache-dir fastapi uvicorn[standard] faster-whisper
  WORKDIR /srv
  COPY transcriber/ .
  EXPOSE 8060
  CMD ["uvicorn","transcriber:app","--host","0.0.0.0","--port","8060"]
  ```
- Backend/Dockerfile (ajuste mínimo):
  ```Dockerfile
  # manter Node 20 slim e ffmpeg como já está
  ENV TRANSCRIBER_URL=http://transcriber:8060
  EXPOSE 5001
  CMD ["node","server.js"]
  ```
- docker-compose.yml (resumo):
  ```yaml
  services:
    backend:
      build: ./Backend
      env_file: .env
      environment:
        - TRANSCRIBER_URL=http://transcriber:8060
      depends_on:
        - transcriber
      ports:
        - "5001:5001"
      volumes:
        - ./Backend/temp_audio:/app/temp_audio
    transcriber:
      build: ./Transcriber
      ports:
        - "8060:8060"
      deploy:
        resources:
          reservations:
            devices:
              - capabilities: [gpu] # opcional se usar GPU
  ```

## Opção Simples: Um único container (executa dois processos)
- Se preferir sem compose, ajustar `Backend/Dockerfile` para instalar Python/pip e iniciar uvicorn junto com Node.
- Backend/Dockerfile (exemplo):
  ```Dockerfile
  FROM node:20.18-slim
  RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip && rm -rf /var/lib/apt/lists/*
  RUN pip3 install --no-cache-dir fastapi uvicorn[standard] faster-whisper
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --omit=dev
  COPY . .
  ENV TRANSCRIBER_URL=http://127.0.0.1:8060
  EXPOSE 5001 8060
  CMD bash -lc "uvicorn transcriber:app --host 0.0.0.0 --port 8060 & node server.js"
  ```
- Requer arquivo `Backend/transcriber.py` com `app` FastAPI.

## Ajustes Backend/Frontend
- Backend:
  - Ler `TRANSCRIBER_URL` e chamar `POST /transcribe` no fallback da rota de transcrição.
  - Manter limpeza de `temp_audio` e SSE de progresso.
- Frontend:
  - Remover instruções de instalação local do Whisper; exibir "Transcrevendo no servidor".

## Entrega no Deploy
- Com compose: `docker compose up -d --build` instala tudo automaticamente.
- Em container único: a imagem instala pip e inicia uvicorn junto com Node.

## Segurança/Operação
- Limitar tamanho/tempo via timeout de backend; apaga temporários.
- Cache: se `full_transcript` já existir, não retranscrever.

Confirma que quer seguir com a opção recomendada (dois containers) ou prefere a simples (um container)?