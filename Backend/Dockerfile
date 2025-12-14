# Usar Node 20.18 (compatível com suas dependências)
FROM node:20.18-slim

# Instalando dependências nativas obrigatórias + ffmpeg + sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    sqlite3 \
    build-essential \
    git \
    python3 \
    python3-pip \
    python3-venv \
    chromium \
    libglib2.0-0 libnss3 libxss1 libasound2 libatk-bridge2.0-0 libgtk-3-0 \
    libxrender1 libxext6 libgl1 \
 && rm -rf /var/lib/apt/lists/*

# Alias para compatibilidade com scripts que chamam `python`
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Permitir instalação via pip em sistema gerenciado (PEP 668)
ENV PIP_BREAK_SYSTEM_PACKAGES=1

# Atualizar pip para versão mais recente
RUN python3 -m pip install --no-cache-dir --break-system-packages --upgrade pip setuptools wheel

# Instalar dependências de transcrição (Whisper local + downloader com EJS)
# Instalar yt-dlp primeiro (mais simples)
RUN python3 -m pip install --no-cache-dir --break-system-packages "yt-dlp[default]"

# Instalar openai-whisper com versão específica do torch (CPU only) para evitar problemas de hash
# Usar torch CPU-only para evitar dependências NVIDIA problemáticas
RUN python3 -m pip install --no-cache-dir --break-system-packages \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.1.0 torchaudio==2.1.0 && \
    python3 -m pip install --no-cache-dir --break-system-packages \
    openai-whisper && \
    python3 -m pip install --no-cache-dir --break-system-packages \
    opencv-python-headless timm

# Definir caminho do Chromium para puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

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
