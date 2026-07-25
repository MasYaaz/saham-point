#!/usr/bin/env bash

set -e

# ============================================================================
# CONFIGURATION
# Ubah `USERNAME/REPO` sesuai nama akun GitHub dan repository kamu!
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
echo -e "${BLUE}            🚀 Installing Saham Point               ${NC}"
echo -e "${BLUE}====================================================${NC}\n"

# 1. Cek Dependency Tools Download (curl/wget)
if command -v curl >/dev/null 2>&1; then
    FETCH_CMD="curl -fsSL -o"
elif command -v wget >/dev/null 2>&1; then
    FETCH_CMD="wget -qO"
else
    echo -e "${RED}❌ Error: Membutuhkan 'curl' atau 'wget' untuk mengunduh file.${NC}"
    exit 1
fi

# 2. Cek & Instal Bun Runtime
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

# 3. Cek & Instal Playwright Chromium
echo -e "${YELLOW}🔍 Memeriksa Playwright Chromium Browser...${NC}"
PLAYWRIGHT_CACHE="$HOME/.cache/ms-playwright"

if [ -d "$PLAYWRIGHT_CACHE" ] && ls "$PLAYWRIGHT_CACHE" | grep -q "chromium"; then
    echo -e "  └─ ${GREEN}✓ Playwright Chromium sudah terinstal.${NC}"
else
    echo -e "  └─ ${YELLOW}🌐 Menginstal Playwright Chromium Headless Shell...${NC}"
    bunx playwright install chromium-headless-shell
    echo -e "  └─ ${GREEN}✓ Playwright Chromium Headless Shell berhasil diinstal!${NC}"
fi

# 4. Buat Direktori Instalasi
echo -e "${YELLOW}📁 Membuat direktori instalasi di ${INSTALL_DIR}...${NC}"
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/logs"
mkdir -p "$BIN_DIR"

# 5. Unduh File / Release Asset
echo -e "${YELLOW}🔍 Mencari release terbaru dari GitHub (${GITHUB_REPO})...${NC}"
LATEST_RELEASE_URL="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
TARBALL_URL=$(curl -s "$LATEST_RELEASE_URL" | grep "browser_download_url" | grep "saham-point-linux-x64.tar.gz" | cut -d '"' -f 4 || true)

RAW_BASE_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/main/.saham-point"

if [ -n "$TARBALL_URL" ]; then
    echo -e "${GREEN}📦 Mengunduh paket release terbaru...${NC}"
    $FETCH_CMD /tmp/saham-point.tar.gz "$TARBALL_URL"
    tar -xzf /tmp/saham-point.tar.gz -C "$INSTALL_DIR"
    rm /tmp/saham-point.tar.gz
else
    echo -e "${YELLOW}⚠️ Release tarball tidak ditemukan, mengunduh file binary langsung dari repo...${NC}"

    echo -e "  └─ Downloading saham-point-mcp..."
    $FETCH_CMD "$INSTALL_DIR/saham-point-mcp" "$RAW_BASE_URL/saham-point-mcp"

    echo -e "  └─ Downloading saham-point-worker..."
    $FETCH_CMD "$INSTALL_DIR/saham-point-worker" "$RAW_BASE_URL/saham-point-worker"

    echo -e "  └─ Downloading saham-point-cli..."
    $FETCH_CMD "$INSTALL_DIR/saham-point-cli" "$RAW_BASE_URL/saham-point-cli"

    echo -e "  └─ Downloading all_stocks.json..."
    $FETCH_CMD "$INSTALL_DIR/data/all_stocks.json" "$RAW_BASE_URL/data/all_stocks.json"
fi

# 6. Beri Izin Executable (chmod +x)
echo -e "${YELLOW}🔑 Mengatur izin eksekusi binary...${NC}"
chmod +x "$INSTALL_DIR/saham-point-mcp"
chmod +x "$INSTALL_DIR/saham-point-worker"
chmod +x "$INSTALL_DIR/saham-point-cli"

# 7. Buat Symlink di ~/.local/bin
echo -e "${YELLOW}🔗 Membuat symlink di ${BIN_DIR}...${NC}"
ln -sf "$INSTALL_DIR/saham-point-cli" "$BIN_DIR/saham-point"
ln -sf "$INSTALL_DIR/saham-point-worker" "$BIN_DIR/saham-point-worker"

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}      ✅ Instalasi Saham Point Berhasil!            ${NC}"
echo -e "${GREEN}====================================================${NC}\n"

echo -e "Lokasi File : ${BLUE}${INSTALL_DIR}${NC}"
echo -e "\n📌 ${YELLOW}Langkah Selanjutnya:${NC}"
echo -e " 1. Jalankan CLI   : ${GREEN}saham-point${NC} (atau $INSTALL_DIR/saham-point-cli)"
echo -e " 2. Daftarkan MCP  : ${GREEN}hermes mcp add saham-point --command \"$INSTALL_DIR/saham-point-mcp\"${NC}\n"
