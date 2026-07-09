# Gunakan image resmi Bun versi slim
FROM oven/bun:1.3-slim AS base
WORKDIR /app

# Install dependencies sistem yang diperlukan oleh Playwright
# (Lib ini wajib agar Chromium bisa berjalan di dalam container)
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies aplikasi
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Install browser Playwright (Chromium saja untuk menghemat ruang)
RUN bunx playwright install chromium

# Copy source code
COPY . .

# Expose port yang digunakan oleh Hono
EXPOSE 3000

# Jalankan aplikasi (produksi)
CMD ["bun", "point"]