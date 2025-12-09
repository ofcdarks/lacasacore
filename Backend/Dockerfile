# Usar Node 20.18 (compatível com suas dependências)
FROM node:20.18-slim

# Instalando dependências nativas obrigatórias + ffmpeg + sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    sqlite3 \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
 && rm -rf /var/lib/apt/lists/*

# Alias para compatibilidade com scripts que chamam `python`
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Permitir instalação via pip em sistema gerenciado (PEP 668)
ENV PIP_BREAK_SYSTEM_PACKAGES=1

# Instalar dependências de transcrição (Whisper local + downloader com EJS)
RUN python3 -m pip install --no-cache-dir --break-system-packages openai-whisper "yt-dlp[default]"

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
