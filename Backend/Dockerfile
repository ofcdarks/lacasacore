# Imagem base leve e confiável
FROM node:18-slim

# Instalando dependências nativas obrigatórias + ffmpeg + sqlite3
RUN apt-get update && apt-get install -y \
    ffmpeg \
    sqlite3 \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Diretório da aplicação
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências (melhor para reconstruções)
RUN npm install --production

# Copiar restante da aplicação
COPY . .

# Criar pasta usada por você (temp_audio, etc)
RUN mkdir -p temp_audio

# Expor porta do servidor
EXPOSE 3000

# Iniciar servidor
CMD ["node", "server.js"]
