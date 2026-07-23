# Gunakan image resmi Bun versi slim
FROM oven/bun:1.3-slim AS base
WORKDIR /app

# Mengunci lokasi penyimpanan biner Chromium Playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 1. Copy dulu file lock dependency
COPY package.json bun.lock ./

# 2. Install dependencies aplikasi
RUN bun install --frozen-lockfile

# 3. Install Chromium beserta dependency OS secara otomatis + Cache Mount
# --with-deps menggantikan semua perintah apt-get install manual di atas
# --mount=type=cache mengunci biner browser di lokal Docker daemon
RUN --mount=type=cache,target=/ms-playwright \
    --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    bunx playwright install --with-deps chromium

# 4. Copy seluruh source code (ditaruh paling bawah agar cache layer atas tidak jebol)
COPY . .

EXPOSE 3000

CMD ["bun", "point"]
