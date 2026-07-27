#!/usr/bin/env bash

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================
GITHUB_REPO="MasYaaz/saham-point"
INSTALL_DIR="$HOME/.saham-point"
BIN_DIR="$HOME/.local/bin"

# Visual Color Styling
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}             🚀 Installing Saham Point              ${NC}"
echo -e "${BLUE}====================================================${NC}\n"

# 1. Deteksi Lingkungan Sistem
OS_RAW="$(uname -s | tr '[:upper:]' '[:lower:]')"
IS_WINDOWS=false
if [[ "$OS_RAW" == *"mingw"* ]] || [[ "$OS_RAW" == *"cygwin"* ]] || [[ "$OS_RAW" == *"msys"* ]]; then
    IS_WINDOWS=true
    echo -e "${YELLOW}🖥️  Terdeteksi lingkungan Windows (Git Bash/MSYS2)${NC}"
else
    echo -e "${GREEN}🖥️  Terdeteksi sistem POSIX (${OS_RAW})${NC}"
fi

# 2. Cek Dependency Tools Download (curl/wget)
if command -v curl >/dev/null 2>&1; then
    FETCH_CMD="curl -fsSL -o"
elif command -v wget >/dev/null 2>&1; then
    FETCH_CMD="wget -qO"
else
    echo -e "${RED}❌ Error: Membutuhkan 'curl' atau 'wget' untuk mengunduh file.${NC}"
    exit 1
fi

# 3. Cek & Instal Bun Runtime (Wajib untuk running .js bundle)
echo -e "${YELLOW}🔍 Memeriksa Bun Runtime...${NC}"
if command -v bun >/dev/null 2>&1; then
    BUN_VER=$(bun --version)
    echo -e "  └─ ${GREEN}✓ Bun sudah terinstal (v${BUN_VER})${NC}"
else
    echo -e "  └─ ${YELLOW}⚠️ Bun tidak ditemukan. Mengunduh dan menginstal Bun...${NC}"
    curl -fsSL https://bun.sh/install | bash

    # Muat environment Bun ke sesi shell saat ini
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"

    if command -v bun >/dev/null 2>&1; then
        echo -e "  └─ ${GREEN}✓ Bun berhasil diinstal!${NC}"
    else
        echo -e "  └─ ${RED}❌ Gagal menginstal Bun. Silakan instal manual via https://bun.sh${NC}"
        exit 1
    fi
fi

# 4. Cek & Instal PM2 Process Manager
echo -e "${YELLOW}🔍 Memeriksa PM2 Process Manager...${NC}"
if command -v pm2 >/dev/null 2>&1; then
    echo -e "  └─ ${GREEN}✓ PM2 sudah terinstal.${NC}"
else
    echo -e "  └─ ${YELLOW}⚙️ PM2 tidak ditemukan. Menginstal PM2 secara global via Bun...${NC}"
    bun install -g pm2 || npm install -g pm2 || true

    export PATH="$HOME/.bun/bin:$PATH"

    if command -v pm2 >/dev/null 2>&1; then
        echo -e "  └─ ${GREEN}✓ PM2 berhasil diinstal!${NC}"
    else
        echo -e "  └─ ${RED}⚠️ Gagal menginstal PM2 secara otomatis. Langkah PM2 akan dilewati.${NC}"
    fi
fi

# 5. Cek & Instal Playwright Chromium
echo -e "${YELLOW}🔍 Memeriksa Playwright Chromium Browser...${NC}"
PLAYWRIGHT_CACHE="$HOME/.cache/ms-playwright"
if [[ "$OS_RAW" == "darwin"* ]]; then
    PLAYWRIGHT_CACHE="$HOME/Library/Caches/ms-playwright"
elif [ "$IS_WINDOWS" = true ]; then
    PLAYWRIGHT_CACHE="$LOCALAPPDATA/ms-playwright"
fi

if [ -d "$PLAYWRIGHT_CACHE" ] && ls "$PLAYWRIGHT_CACHE" 2>/dev/null | grep -q "chromium"; then
    echo -e "  └─ ${GREEN}✓ Playwright Chromium sudah terinstal.${NC}"
else
    echo -e "  └─ ${YELLOW}🌐 Menginstal Playwright Chromium Headless Shell...${NC}"
    bunx playwright install chromium-headless-shell
    echo -e "  └─ ${GREEN}✓ Playwright Chromium Headless Shell berhasil diinstal!${NC}"
fi

# 6. Buat Direktori Instalasi
echo -e "${YELLOW}📁 Membuat direktori instalasi di ${INSTALL_DIR}...${NC}"
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/logs"
mkdir -p "$BIN_DIR"

# 7. Unduh File / Release Asset Tarball
echo -e "${YELLOW}🔍 Mencari release bundle terbaru dari GitHub (${GITHUB_REPO})...${NC}"
LATEST_RELEASE_URL="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
TARBALL_URL=$(curl -sH "User-Agent: SahamPoint-Installer" "$LATEST_RELEASE_URL" | grep "browser_download_url" | grep "saham-point.tar.gz" | cut -d '"' -f 4 || true)

RAW_BASE_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/main/.saham-point"

if [ -n "$TARBALL_URL" ]; then
    echo -e "${GREEN}📦 Mengunduh paket release bundle...${NC}"
    $FETCH_CMD /tmp/saham-point.tar.gz "$TARBALL_URL"
    tar -xzf /tmp/saham-point.tar.gz -C "$INSTALL_DIR" --strip-components=1 2>/dev/null || tar -xzf /tmp/saham-point.tar.gz -C "$INSTALL_DIR"
    rm /tmp/saham-point.tar.gz
else
    echo -e "${YELLOW}⚠️ Release tarball tidak ditemukan, mengunduh file bundle JS langsung dari repo...${NC}"

    echo -e "  └─ Downloading saham-point-mcp..."
    $FETCH_CMD "$INSTALL_DIR/saham-point-mcp" "$RAW_BASE_URL/saham-point-mcp" 2>/dev/null || $FETCH_CMD "$INSTALL_DIR/saham-point-mcp.js" "$RAW_BASE_URL/saham-point-mcp.js"

    echo -e "  └─ Downloading saham-point-worker..."
    $FETCH_CMD "$INSTALL_DIR/saham-point-worker" "$RAW_BASE_URL/saham-point-worker" 2>/dev/null || $FETCH_CMD "$INSTALL_DIR/saham-point-worker.js" "$RAW_BASE_URL/saham-point-worker.js"

    echo -e "  └─ Downloading saham-point-cli..."
    $FETCH_CMD "$INSTALL_DIR/saham-point-cli" "$RAW_BASE_URL/saham-point-cli" 2>/dev/null || $FETCH_CMD "$INSTALL_DIR/saham-point-cli.js" "$RAW_BASE_URL/saham-point-cli.js"

    echo -e "  └─ Downloading all_stocks.json..."
    $FETCH_CMD "$INSTALL_DIR/data/all_stocks.json" "$RAW_BASE_URL/data/all_stocks.json"
fi

# Tentukan file target (apakah pakai akhiran .js atau tidak)
CLI_FILE="$INSTALL_DIR/saham-point-cli"
WORKER_FILE="$INSTALL_DIR/saham-point-worker"
MCP_FILE="$INSTALL_DIR/saham-point-mcp"

[ -f "${CLI_FILE}.js" ] && CLI_FILE="${CLI_FILE}.js"
[ -f "${WORKER_FILE}.js" ] && WORKER_FILE="${WORKER_FILE}.js"
[ -f "${MCP_FILE}.js" ] && MCP_FILE="${MCP_FILE}.js"

# 8. Pastikan File Memiliki Shebang `#!/usr/bin/env bun` & Executable
echo -e "${YELLOW}🔑 Mengatur izin eksekusi script JS...${NC}"
chmod +x "$CLI_FILE" "$WORKER_FILE" "$MCP_FILE" 2>/dev/null || true

# 9. Buat Symlink & Wrapper Executable di ~/.local/bin
echo -e "${YELLOW}🔗 Membuat perintah di ${BIN_DIR}...${NC}"

# Symlink POSIX standar (Linux/macOS/Git Bash)
ln -sf "$CLI_FILE" "$BIN_DIR/saham-point"
ln -sf "$WORKER_FILE" "$BIN_DIR/saham-point-worker"

# Jika di Windows, buatkan file .cmd wrapper agar bisa dipanggil juga via CMD & PowerShell
if [ "$IS_WINDOWS" = true ]; then
    cat << EOF > "$BIN_DIR/saham-point.cmd"
@echo off
bun "$CLI_FILE" %*
EOF
    cat << EOF > "$BIN_DIR/saham-point-worker.cmd"
@echo off
bun "$WORKER_FILE" %*
EOF
fi

# 10. Mendaftarkan & Menjalankan Worker JS di PM2
if command -v pm2 >/dev/null 2>&1; then
    echo -e "${YELLOW}🔄 Mendaftarkan saham-point-worker ke PM2...${NC}"
    if pm2 describe saham-point-worker >/dev/null 2>&1; then
        pm2 restart saham-point-worker --update-env >/dev/null 2>&1 || true
        echo -e "  └─ ${GREEN}✓ Worker berhasil direstart di PM2!${NC}"
    else
        # Pakai interpreter bun secara eksplisit agar PM2 menjalankan JS via Bun Runtime
        pm2 start "$WORKER_FILE" --name "saham-point-worker" --interpreter bun >/dev/null 2>&1 || true
        pm2 save >/dev/null 2>&1 || true
        echo -e "  └─ ${GREEN}✓ Worker JS berhasil didaftarkan dan berjalan di PM2 (via Bun)!${NC}"
    fi
fi

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}      ✅ Instalasi Saham Point Berhasil!            ${NC}"
echo -e "${GREEN}====================================================${NC}\n"

echo -e "Lokasi File : ${BLUE}${INSTALL_DIR}${NC}"
echo -e "\n📌 ${YELLOW}Langkah Selanjutnya:${NC}"
echo -e " 1. Jalankan CLI   : ${GREEN}saham-point${NC}"
echo -e " 2. Daftarkan MCP  : ${GREEN}hermes mcp add saham-point --command \"bun\" --args \"$MCP_FILE\"${NC}"
if command -v pm2 >/dev/null 2>&1; then
    echo -e " 3. Cek Worker PM2 : ${GREEN}pm2 status${NC}"
fi

# Peringatan jika ~/.local/bin belum masuk ke $PATH user
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo -e "\n${RED}⚠️ Catatan:${NC} Path ${BIN_DIR} belum ada di \$PATH shell kamu."
    echo -e "   Jalankan ini agar perintah '${GREEN}saham-point${NC}' bisa dipanggil dari mana saja:"
    echo -e "   ${YELLOW}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC} (tambahkan ke ~/.bashrc, ~/.zshrc, atau config.fish)\n"
fi
