# Gunakan image resmi Bun versi slim
FROM oven/bun:1.3-slim AS base
WORKDIR /app

# Mengunci lokasi penyimpanan biner Chromium Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 1. Copy file lock dependency
COPY package.json bun.lock ./

# 2. Install dependencies aplikasi
RUN bun install --frozen-lockfile

# 3. Download Chromium headless aja
RUN apt-get update && \
    bunx playwright install --with-deps chromium-headless-shell && \
    rm -rf /var/lib/apt/lists/*

# 4. Copy seluruh source code
COPY . .

EXPOSE 3000

CMD ["bun", "point"]
