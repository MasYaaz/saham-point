# Saham Point

MCP server untuk data dan analisis saham Indonesia. Saham Point menggabungkan data IDX/BEI, KSEI, TradingView, Yahoo Finance, Stockbit, dan Google News ke SQLite lokal, lalu mengeksposnya sebagai tool Model Context Protocol untuk AI agent.

Saham Point cocok dipakai sebagai data layer lokal untuk analisis emiten IDX: profil saham, laporan keuangan, corporate action, indikator teknikal, screener, dividen, bandarmology, foreign flow, dan berita pasar.

> [!NOTE]
> Dokumentasi teknis lengkap ada di [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) dan [`docs/API_OR_CONTRACTS.md`](docs/API_OR_CONTRACTS.md). Gunakan dua file itu sebagai source of truth saat mengubah arsitektur atau kontrak tool.

## Features

- MCP server stdio untuk dipakai langsung oleh AI agent.
- SQLite local cache di `data/saham.db`.
- Sinkronisasi emiten, harga pasar, rasio, corporate action, fundamental, dan histori dividen.
- Screener aktif untuk undervalued, market cap, teknikal, dividen, cash rich, growth, ranking, dan saham spekulatif/gorengan.
- Analyzer dividen dengan TTM yield, DPR, CAGR, streak, dan safety rating.
- Integrasi market data IDX, KSEI, TradingView, Yahoo Finance, Stockbit, dan Google News.
- Worker background untuk initial sync dan update harga berkala saat jam bursa.

## Tech Stack

| Area       | Teknologi                                    |
| ---------- | -------------------------------------------- |
| Runtime    | Bun                                          |
| Language   | TypeScript ESM                               |
| Protocol   | Model Context Protocol SDK                   |
| Database   | SQLite via `bun:sqlite`                      |
| Scheduler  | `node-cron`                                  |
| Indicators | `technicalindicators`                        |
| News       | `rss-parser`, `@extractus/article-extractor` |

## Requirements

- Bun
- Internet access untuk sinkronisasi data eksternal
- Token Stockbit jika memakai broker summary:
  - `STOCKBIT_BEARER_TOKEN`
  - `STOCKBIT_REFRESH_TOKEN`

## Setup

Install dependencies:

```bash
bun install
```

Siapkan `.env` dari contoh berikut:

```bash
STOCKBIT_BEARER_TOKEN=DI_ISI_OTOMATIS
STOCKBIT_REFRESH_TOKEN=YOUR_STOCKBIT_REFRESH_TOKEN
```

Jalankan MCP server:

```bash
bun run start
```

Mode development:

```bash
bun run dev
```

Build distribusi:

```bash
bun run build:tar
```

> [!CAUTION]
> `bun run build:tar` menghapus ulang `dist` dan `saham-point.tar.gz` sebelum membuat arsip baru.

## MCP Tools

### Stock & News

- `search_stock_code`
- `list_emiten`
- `get_stock_profile`
- `get_technical_indicators`
- `search_news`

### Market

- `get_corporate_actions`
- `get_market_overview`
- `get_sector_emiten`

### Bandarmology

- `get_broker_summary`
- `get_foreign_flow`

### Screener

- `screener_undervalued`
- `screener_market_cap`
- `screener_technical`
- `screener_dividends`
- `screener_cash_rich`
- `screener_growth`
- `screener_rankings`
- `screener_gorengan`

### Analyzer & Sync

- `analyze_dividend`
- `manage_stock_histories_sync`
- `manage_dividend_histories_sync`
- `manage_system_logs`

## Data Sources

| Sumber                | Data                                                |
| --------------------- | --------------------------------------------------- |
| TradingView Scanner   | daftar emiten, harga, market cap, rasio ringkas     |
| TradingView WebSocket | fundamental historis dan histori dividen            |
| Yahoo Finance         | candle OHLCV untuk indikator teknikal               |
| IDX/BEI               | market overview, trading summary, UMA, foreign flow |
| KSEI                  | corporate action                                    |
| Stockbit              | broker summary dan bandar detector                  |
| Google News           | berita dan artikel pasar                            |

## Local Data

Database dibuat otomatis di:

```text
data/saham.db
```

Tabel utama:

- `emiten`
- `stock_histories`
- `dividend_histories`
- `corporate_actions`
- `sync_ca_history`

## Project Structure

```text
src/
  mcp.ts                 # MCP server entry point
  worker.ts              # background scheduler
  db/                    # SQLite schema and connection
  mcp/                   # MCP tool registry
  client/                # external API clients
  services/              # sync, screener, analyzer, news, market logic
  auth/                  # Stockbit token refresh
  utils/                 # date, log, RSS, indicator, promise helpers
  types.ts               # shared types
docs/
  ARCHITECTURE.md
  API_OR_CONTRACTS.md
```

## Sync Behavior

Saat MCP server berjalan, `src/mcp.ts` memicu `src/worker.ts` sebagai child process. Worker melakukan initial sync untuk:

- daftar emiten,
- data pasar lengkap,
- corporate action KSEI.

Setelah itu worker menjalankan update harga setiap menit pada Senin-Jumat jam 09:00-16:59 WIB.

Sinkronisasi histori fundamental dan dividen dapat dikontrol lewat tool:

- `manage_stock_histories_sync`
- `manage_dividend_histories_sync`
