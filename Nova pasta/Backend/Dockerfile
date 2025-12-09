# Usar Node 20.18 (compatível com suas dependências)
FROM node:20.18-slim

# Instalando dependências nativas obrigatórias + ffmpeg + sqlite3
RUN apt-get update && apt-get install -y \
    ffmpeg \
    sqlite3 \
    build-essential \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependências de transcrição (Whisper local + downloader estável)
RUN pip3 install --no-cache-dir openai-whisper yt-dlp

# Diretório da aplicação
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm install --omit=dev

# Copiar restante dos arquivos
COPY . .

# Criar pastas usadas pela aplicação
RUN mkdir -p temp_audio

# Expor a porta do servidor
EXPOSE 5001

# Iniciar aplicação
CMD ["node", "server.js"]
