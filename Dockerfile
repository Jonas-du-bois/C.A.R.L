FROM node:20-slim

# Install dependencies for Puppeteer and native modules compilation
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libfreetype6 \
    libharfbuzz-bin \
    ca-certificates \
    fonts-freefont-ttf \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create data directory with proper permissions
RUN mkdir -p /app/data/.wwebjs_auth && chmod -R 777 /app/data

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Clean up any stale Chromium lock files on startup (LocalAuth stores in session-clientId folder)
CMD find /app/data/.wwebjs_auth -name "SingletonLock" -delete 2>/dev/null; \
    find /app/data/.wwebjs_auth -name "SingletonSocket" -delete 2>/dev/null; \
    find /app/data/.wwebjs_auth -name "SingletonCookie" -delete 2>/dev/null; \
    node src/index.js
