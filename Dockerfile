# Gunakan image resmi Bun versi slim
FROM oven/bun:1.3-slim AS base
WORKDIR /app

# Mengunci jalur installasi browser Playwright agar predictable
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Install dependencies sistem yang diperlukan oleh Playwright
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
    libxfixes3 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies aplikasi
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Install browser Playwright khusus chromium di folder yang ditentukan env
RUN bunx playwright install chromium

# Copy seluruh source code
COPY . .

# Expose port Hono API
EXPOSE 3000

CMD ["bun", "point"]