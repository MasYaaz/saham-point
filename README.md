<div align="center">

<pre style="color: #83f496; font-weight: bold; background-color: transparent; border: none; margin-bottom: 0;">
███████╗ █████╗ ██╗  ██╗ █████╗ ███╗   ███╗    ██████╗  ██████╗ ██╗███╗   ██╗████████╗
██╔════╝██╔══██╗██║  ██║██╔══██╗████╗ ████║    ██╔══██╗██╔═══██╗██║████╗  ██║╚══██╔══╝
███████╗███████║███████║███████║██╔████╔██║    ██████╔╝██║   ██║██║██╔██╗ ██║   ██║   
╚════██║██╔══██║██╔══██║██╔══██║██║╚██╔╝██║    ██╔═══╝ ██║   ██║██║██║╚██╗██║   ██║   
███████║██║  ██║██║  ██║██║  ██║██║ ╚═╝ ██║    ██║     ╚██████╔╝██║██║ ╚████║   ██║   
╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝    ╚═╝      ╚═════╝ ╚═╝╚═╝  ╚═══╝   ╚═╝   
</pre>

### Scrapper Data IHSG & MCP Server untuk Agentic AI

<img src="src/assets/TUI.webp" alt="Tampilan Utama" width="1000">

</div>

Proyek ini adalah aplikasi komprehensif yang berfungsi sebagai **Command Line Interface (CLI)** dan **API Gateway**. Tujuannya adalah untuk mengambil, memproses, dan memantau data pasar saham secara _real-time_ dari berbagai sumber. Aplikasi ini menyediakan pembaruan status melalui Antarmuka Pengguna Berbasis Teks (TUI), serta menyediakan serangkaian API RESTful yang kaya fitur untuk analisis mendalam.

---

## 🚀 Fitur Utama

- **CLI Interaktif**
  Menyediakan antarmuka baris perintah dengan kemampuan live monitoring dan manajemen data.

- **MCP Server**
  Menawarkan serangkaian MCP (Model Context Protocol) tools untuk akses data terprogram oleh AI agent, termasuk profil saham & analisis teknikal.

- **Data Scraping Otomatis**
  Menggunakan scraper untuk mengambil data fundamental dan harga secara terjadwal (cron).

- **Database Persisten**
  Mengelola data pasar saham menggunakan database internal dengan riwayat tahunan.

- **Fitur Analisis Lanjutan**
  Menyediakan endpoint API khusus untuk screener lanjutan seperti Value Investing, Growth Screener, dan Dividend Hunters.

---

## 🛠️ Pengaturan & Instalasi

Proyek ini dibangun dengan **Bun** dan **TypeScript**. Pastikan kamu sudah memiliki [Bun](https://bun.sh/) di sistemmu.

### 1. Instalasi Dependensi

Jalankan perintah berikut untuk mengunduh semua kebutuhan proyek:

```bash
bun install
```

### 2. Menjalankan Aplikasi

Gunakan skrip `point` yang didefinisikan dalam `package.json` untuk menjalankan aplikasi:

```bash
bun point
```

---

## ⚙️ Penggunaan & Perintah (CLI)

Aplikasi ini mendukung beberapa perintah utama melalui TUI-nya:

- **`sync`**
  Memulai siklus sinkronisasi data fundamental dan harga pasar secara otomatis. Proses ini berjalan di latar belakang dengan progress bar.

- **`detail <kode>`**
  Mengambil profil lengkap saham, termasuk ringkasan metrik finansial dan riwayat historis 5 tahun.

- **`show emiten`**
  Mendaftar semua kode emiten yang tersimpan di database beserta status pembaruan data terakhirnya.

- **`show endpoints`**
  Menampilkan daftar dinamis semua MCP tools yang tersedia pada server.

- **`clear` / `exit`**
  Mengontrol tampilan dan menghentikan aplikasi.

---

## 📚 Panduan Dokumentasi Proyek Mendalam (Arsitektur)

Bagian ini memberikan rincian mendalam tentang arsitektur sistem, membagi fungsionalitas menjadi tiga pilar utama.

### 1. Pilar Data Scraping & Persistence

- **Alur Kerja:** Proses data dimulai dari `src/scrapper/index.ts` yang menjadwalkan pengambilan harga real-time (`syncMarketPrices`) dan sinkronisasi fundamental secara massal (`syncDataAll`).
- **Database Schema:** Struktur database di `src/db/index.ts` menyimpan data emiten utama, serta tabel terpisah untuk riwayat finansial tahunan (`stock_histories`), memungkinkan analisis historis mendalam.

### 2. Pilar MCP Server (Backend)

Semua fungsionalitas canggih tidak lagi diekspos sebagai REST endpoint konvensional, melainkan sebagai **MCP (Model Context Protocol) Tools** melalui `src/routes/mcp.router.ts`. Setiap request membuat instans `McpServer` dan transport baru (stateless), sehingga dapat dipanggil langsung oleh AI agent (mis. Claude) secara terprogram.

### 3. Pilar CLI & TUI

CLI berfungsi sebagai antarmuka pengguna utama, memanfaatkan `src/cli/tui-engine.ts` dan `src/cli/command.ts` untuk menampilkan status sistem secara real-time melalui TUI yang interaktif.

---

## 🤖 Fitur MCP Tools

**Kategori:** Model Context Protocol Server
**File:** `src/routes/mcp.router.ts`
**Dependencies:** `@modelcontextprotocol/sdk`, `zod`

Server MCP didaftarkan dengan nama `saham-point-mcp` dan menyediakan dua kelompok tools: **Saham Core Tools** untuk data profil/analisis emiten, dan **Screener Tools** untuk penyaringan saham berbasis kriteria.

### ✅ Saham Core Tools

| Tool                       | Parameter                                                            | Deskripsi                                                                                                       |
| -------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `get_stock_profile`        | `code` (string)                                                      | Mengambil profil ringkas emiten IDX beserta seluruh laporan keuangan tahunannya.                                |
| `get_technical_indicators` | `code` (string), `range` (default `1y`: `1mo`/`3mo`/`6mo`/`1y`/`2y`) | Mengambil rangkuman 16+ indikator teknikal (RSI, MACD, Moving Averages, Bollinger, ATR, ADX, Ichimoku, Volume). |
| `get_stock_valuation`      | `code` (string)                                                      | Estimasi harga wajar emiten berdasarkan rasio PER saat ini vs rata-rata PER historis 5 tahun.                   |
| `get_stock_growth`         | `code` (string)                                                      | Menganalisis tren pertumbuhan YoY pendapatan dan laba bersih emiten.                                            |
| `get_stock_news`           | `code` (string), `limit` (default `10`)                              | Mengambil berita finansial & emiten terkini dari RSS Google News & Yahoo Finance.                               |
| `get_sector_emiten`        | `name` (string, mis. `Financials`, `Healthcare`, `Technology`)       | Mengambil daftar emiten dalam satu sektor, diurutkan dari market cap terbesar.                                  |

### ✅ Screener Tools

| Tool                        | Parameter (default)                                                              | Deskripsi                                                                            |
| --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `screener_undervalued`      | `max_pbv` (1.5), `min_roe` (10.0), `max_der` (2.0), `limit` (25)                 | Value Investing — menyaring saham murah dengan ROE tinggi, DER sehat, PBV/PER wajar. |
| `screener_market_cap`       | `min_market_cap` (0), `max_market_cap` (opsional), `sort` (`desc`), `limit` (25) | Menyaring saham berdasarkan rentang kapitalisasi pasar.                              |
| `screener_technical`        | `strategy` (`breakout`), `limit` (30)                                            | Momentum harga harian berdasarkan strategi teknikal (breakout, reversal, volatile).  |
| `screener_dividend_hunters` | `min_yield` (5.0), `limit` (25)                                                  | Memburu saham dengan Dividend Yield jumbo dan rasio utang aman (DER ≤ 1.5).          |
| `screener_cash_rich`        | `limit` (25)                                                                     | Perusahaan super solven dengan Free Cash Flow positif dan Net Debt negatif.          |
| `screener_growth`           | `limit` (25)                                                                     | Emiten dengan akselerasi pertumbuhan laba bersih positif pada laporan terbaru.       |
| `screener_rankings`         | `sort` (`market_cap`), `limit` (25)                                              | Peringkat emiten teratas berdasarkan `market_cap` atau `dividend_yield`.             |

### Arsitektur Handler MCP

- Setiap request (`mcpRouter.all("*")`) membuat **instans `McpServer` dan transport baru** (`WebStandardStreamableHTTPServerTransport`) — bersifat stateless, tanpa `sessionIdGenerator`.
- Body request di-parse sebagai JSON untuk request `POST`, lalu diteruskan ke `transport.handleRequest`.
- Semua tool memvalidasi input menggunakan schema **Zod**, dan mengembalikan hasil sebagai teks JSON (`content: [{ type: "text", text: ... }]`).
- Error pada handler ditangkap dan dikembalikan sebagai response `500` dengan pesan error.

---

<div align="center">

@2026. Saham Point Scrapper IHSG Data & Endpoint API for Agentic AI

</div>
