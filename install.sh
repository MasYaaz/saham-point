#!/usr/bin/env bash

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================
GITHUB_REPO="MasYaaz/saham-point"
INSTALL_DIR="$HOME/.mcp/saham-point"

# Visual Color Styling
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}           🚀 Installing Saham Point MCP            ${NC}"
echo -e "${BLUE}====================================================${NC}\n"

# 1. Deteksi Lingkungan Sistem
OS_RAW="$(uname -s | tr '[:upper:]' '[:lower:]')"
if [[ "$OS_RAW" == *"mingw"* ]] || [[ "$OS_RAW" == *"cygwin"* ]] || [[ "$OS_RAW" == *"msys"* ]]; then
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
    echo -e "${RED}❌ Error: Membutuhkan 'curl' atau 'wget' untuk mengunduh release.${NC}"
    exit 1
fi

# 3. Cek & Instal Bun Runtime (Wajib untuk menjalankan MCP bundle)
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

# 4. Buat Direktori Instalasi
echo -e "${YELLOW}📁 Menyiapkan direktori instalasi di ${INSTALL_DIR}...${NC}"
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/logs"

# 5. Unduh Bundle Eksklusif dari GitHub Release Terbaru
echo -e "${YELLOW}🔍 Mencari release bundle terbaru dari GitHub (${GITHUB_REPO})...${NC}"
LATEST_RELEASE_URL="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
TARBALL_URL=$(curl -sH "User-Agent: SahamPoint-Installer" "$LATEST_RELEASE_URL" | grep "browser_download_url" | grep "saham-point.tar.gz" | cut -d '"' -f 4 || true)

if [ -z "$TARBALL_URL" ]; then
    echo -e "${RED}❌ Error: Asset 'saham-point.tar.gz' tidak ditemukan pada rilis terbaru repository ${GITHUB_REPO}.${NC}"
    echo -e "${RED}   Pastikan GitHub Actions build release sudah selesai dan asset terunggah.${NC}"
    exit 1
fi

echo -e "${GREEN}📦 Mengunduh paket release bundle...${NC}"
TMP_TARBALL="/tmp/saham-point.tar.gz"
$FETCH_CMD "$TMP_TARBALL" "$TARBALL_URL"

echo -e "${YELLOW}📂 Mengekstrak paket ke ${INSTALL_DIR}...${NC}"
tar -xzf "$TMP_TARBALL" -C "$INSTALL_DIR" --strip-components=1 2>/dev/null || tar -xzf "$TMP_TARBALL" -C "$INSTALL_DIR"
rm -f "$TMP_TARBALL"

# 6. Identifikasi File Bundle MCP & Beri Izin Eksekusi
MCP_FILE="$INSTALL_DIR/saham-point-mcp"
[ -f "${MCP_FILE}.js" ] && MCP_FILE="${MCP_FILE}.js"

echo -e "${YELLOW}🔑 Mengatur izin eksekusi berkas MCP...${NC}"
chmod +x "$MCP_FILE" 2>/dev/null || true

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}    ✅ Instalasi Saham Point MCP Berhasil!          ${NC}"
echo -e "${GREEN}====================================================${NC}\n"

echo -e "Direktori Instalasi : ${BLUE}${INSTALL_DIR}${NC}"
echo -e "Berkas MCP Server   : ${BLUE}${MCP_FILE}${NC}"
echo -e "\n📌 ${YELLOW}Langkah Selanjutnya (Daftarkan ke MCP Client):${NC}"
echo -e " ${GREEN}hermes mcp add saham-point --command \"bun\" --args \"$MCP_FILE\"${NC}\n"
