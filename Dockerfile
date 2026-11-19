FROM node:20-bookworm-slim

# better-sqlite3 derleme bağımlılıkları (Raspberry Pi ARM ve x86 için)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Bağımlılık dosyalarını kopyala
COPY package*.json ./

# Sadece üretim bağımlılıklarını yükle
RUN npm install --omit=dev && npm cache clean --force

# Uygulama kaynak kodlarını kopyala
COPY . .

# Çevre değişkenleri
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Port
EXPOSE 3000

# SQLite veritabanı için kalıcı dizin
VOLUME ["/app/data"]

CMD ["node", "server.js"]
