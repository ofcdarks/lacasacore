# syntax=docker/dockerfile:1

FROM node:20.18-slim AS base

ENV NODE_ENV=production
WORKDIR /app

# Dependências do sistema necessárias para ffmpeg, sqlite e build de libs nativas
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        sqlite3 \
        build-essential \
        python3 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copia somente manifests para aproveitar cache de dependências
COPY Backend/package*.json ./
RUN npm install --omit=dev \
    && npm rebuild sqlite3 --build-from-source

# Copia o restante da aplicação
COPY Backend/. .

# Garante diretórios usados em runtime e permissões para usuário não-root
RUN mkdir -p temp_audio data \
    && chown -R node:node /app

USER node

EXPOSE 3000

# EasyPanel detecta automaticamente o comando via CMD
CMD ["node", "server.js"]

