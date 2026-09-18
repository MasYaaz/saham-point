# Architecture

## Ringkasan Sistem

Saham Point adalah MCP server untuk data dan analisis saham Indonesia. Server berjalan melalui stdio, mengekspos tool MCP untuk AI agent, mengambil data dari beberapa sumber eksternal, menyimpan data lokal di SQLite, lalu menjalankan query, screener, dan analisis di atas cache lokal tersebut.

Entry point utama:

- `src/mcp.ts`: MCP server stdio, loader `.env`, registry semua tool, dan pemicu worker child process.
- `src/worker.ts`: background worker untuk sinkronisasi data pasar dan aksi korporasi.
- `src/db/index.ts`: koneksi SQLite, schema, pragma, dan lazy initialization.

## Tech Stack

| Area | Teknologi | Peran |
| --- | --- | --- |
| Runtime | Bun | Menjalankan TypeScript langsung, `bun:sqlite`, `Bun.file`, `Bun.spawn`, build binary target Bun. |
| Bahasa | TypeScript strict | Type-safety untuk client, service, MCP tool, dan model data. |
| Protocol | `@modelcontextprotocol/sdk` | Membuat MCP server dan registrasi tool. |
| Transport | MCP stdio | Komunikasi server dengan host/agent lewat stdin/stdout. |
| Database | SQLite via `bun:sqlite` | Cache lokal emiten, histori fundamental, dividen, corporate action, dan audit sync. |
| Scheduler | `node-cron` | Cron harga pasar tiap menit pada jam bursa. |
| HTTP | Native `fetch` | Client eksternal IDX, KSEI, TradingView REST, Yahoo Finance, Stockbit. |
| WebSocket | Native `WebSocket` | Data fundamental dan histori dividen TradingView. |
| Technical analysis | `technicalindicators` | RSI, SMA, EMA, MACD, Bollinger, ATR, ADX, OBV, CCI, Williams %R, MFI, PSAR, Stochastic RSI, Ichimoku, VWAP. |
| News | `rss-parser`, `@extractus/article-extractor` | Google News RSS dan ekstraksi konten artikel. |

## Directory Responsibilities

| Path | Tanggung Jawab |
| --- | --- |
| `src/mcp.ts` | Membuat server MCP, memuat `.env`, mendaftarkan tool, dan menjalankan worker sebagai child process. |
| `src/worker.ts` | Initial sync dan cron sync harga pasar. Menghindari overlap task lewat flag `isSyncing`. |
| `src/mcp/` | Registry tool MCP. File di folder ini adalah kontrak publik tool: nama, schema input Zod, dan format response text JSON. |
| `src/services/` | Business logic: query database, sinkronisasi data, screener, analyzer, news search, dan wrapper sumber eksternal. |
| `src/client/` | Client HTTP low-level untuk IDX, KSEI, Stockbit, TradingView, dan Yahoo Finance. |
| `src/db/` | Inisialisasi SQLite, schema tabel, index, path `data/saham.db`, dan proxy `db`. |
| `src/auth/` | Refresh token Stockbit dan update runtime/env file `.env`. |
| `src/utils/` | Helper log, tanggal, RSS/Google News, promise pool, parsing limit, dan kalkulasi indikator teknikal. |
| `src/types.ts` | Shared TypeScript interface untuk emiten, candle, Yahoo chart response, dan data histori TradingView. |
| `test/` | Script/test manual per fitur eksternal dan service. Tidak menjadi entry point runtime. |
| `data/` | Dibuat runtime oleh `src/db/index.ts`; menyimpan `saham.db`. |
| `logs/` | Digunakan oleh service log jika sistem menulis/membaca log harian. |

## Data Flow

```text
Host MCP / AI Agent
  -> src/mcp.ts
  -> register tool dari src/mcp/*
  -> service layer src/services/*
  -> db lokal atau client eksternal
  -> hasil dikembalikan sebagai MCP content text JSON
```

### Startup MCP

1. `src/mcp.ts` membaca `.env` manual dari root project jika file tersedia.
2. `createMcpServer()` membuat server bernama `saham-point-mcp` dengan versi dari `src/config.ts`.
3. Tool dari `coreTools`, `stockTools`, `marketTools`, `bandarmologyTools`, `screenerTools`, dan `analyzerTools` didaftarkan.
4. Server tersambung ke `StdioServerTransport`.
5. Worker dipicu sebagai child process `bun run src/worker` dengan `stdio: "ignore"` agar tidak mengganggu transport MCP.

### Database Local Cache

`getDb()` membuat folder `data`, membuka `data/saham.db`, mengaktifkan WAL, busy timeout, foreign key, lalu membuat tabel:

- `emiten`: profil emiten, harga, rasio, dividend yield, dan status sync.
- `stock_histories`: laporan keuangan kuartalan/tahunan dan rasio historis.
- `dividend_histories`: event dividen per emiten.
- `corporate_actions`: corporate action dari KSEI.
- `sync_ca_history`: checkpoint dan audit sinkronisasi corporate action.

Saat DB pertama kali diinisialisasi, `syncStockList()` dipanggil secara background untuk seed/update daftar emiten dari TradingView.

### External Data Ingestion

1. `syncStockList()` mengambil daftar emiten dari TradingView Scanner dan upsert ke `emiten`.
2. `syncStockData()` mengambil harga, profil, market cap, rasio, dan dividen ringkas dari TradingView Scanner lalu update `emiten`.
3. `syncStockPrice()` mengambil kolom harga ringan dari TradingView Scanner untuk update harga rutin.
4. `syncCorporateActions()` mengambil corporate action KSEI, filter kode saham 4 huruf, insert dedupe ke `corporate_actions`, update checkpoint, lalu memicu sync dividen TradingView untuk ticker dividen baru.
5. `syncStockHistories()` mengambil fundamental kuartalan/tahunan via TradingView WebSocket dan upsert ke `stock_histories`.
6. `syncDividendHistories()` mengambil event dividen via TradingView WebSocket dan upsert ke `dividend_histories`.

### Query, Screener, Analyzer

Tool MCP membaca parameter dari host, memanggil service, lalu mengembalikan `content: [{ type: "text", text: JSON.stringify(...) }]`.

Alur umum:

- Query profil, sektor, dan screener mayoritas membaca SQLite lokal.
- Technical indicator mengambil candle dari Yahoo Finance, lalu menghitung indikator dengan `technicalindicators`.
- Gorengan screener mengambil kandidat UMA dari IDX, fallback ke DB lokal, lalu memperkaya sinyal candle dari Yahoo Finance.
- Broker summary mengambil data Stockbit dengan bearer token.
- Foreign flow dan market overview mengambil ringkasan IDX.
- News search mengambil Google News RSS, decode URL Google News, lalu fetch halaman publisher dengan `curl` via `Bun.spawn` sebelum ekstraksi artikel.

## Integrations

| Sumber | Modul | Data |
| --- | --- | --- |
| TradingView Scanner REST | `src/client/tradingViewClient.ts`, `src/services/tradingviewServices/fetchScreener.ts` | Daftar emiten, harga, market cap, rasio ringkas, dividen ringkas. |
| TradingView WebSocket | `fetchStockHistories.ts`, `fetchDividendHistories.ts` | Fundamental historis dan event dividen. |
| Yahoo Finance Chart | `src/client/yahooClient.ts`, `fetchCandle.ts` | OHLCV untuk indikator teknikal dan gorengan screener. |
| IDX/BEI | `src/client/idxClient.ts`, `idxServices/*` | Market overview, trading summary, foreign flow, UMA. |
| KSEI | `src/client/kseiClient.ts`, `syncCorporateAction.ts` | Corporate action. |
| Stockbit Exodus | `src/client/stockbitClient.ts`, `stockbitServices/fetchBroxSum.ts` | Broker summary dan bandar detector. |
| Google News RSS + publisher page | `newsServices/*`, `utils/rssNews/*` | Berita dan konten artikel. |

## Background Jobs & Schedulers

### Worker Startup

`src/mcp.ts` selalu mencoba menjalankan `src/worker.ts` setelah MCP connected. Worker menggunakan child process dan dihentikan saat MCP process menerima `exit`, `SIGINT`, atau `SIGTERM`.

### Initial Sync

Saat worker aktif, `startMarketWorker()` menjalankan:

- `syncStockList`
- `syncStockData`
- `syncCorporateActions`

Ketiganya dijalankan dalam satu grup `Initial Startup Sync`. Flag `isSyncing` mencegah task lain berjalan bersamaan.

### Cron Harga Pasar

Worker menjadwalkan cron:

```text
*/1 9-16 * * 1-5
timezone: Asia/Jakarta
```

Task tersebut memanggil `syncStockPrice()` setiap menit pada Senin-Jumat jam 09:00-16:59 WIB.

### Manual Background Sync via MCP

Tool berikut menjalankan sinkronisasi non-blocking di proses MCP:

- `manage_stock_histories_sync`: start/pause/status/reset untuk histori fundamental.
- `manage_dividend_histories_sync`: start/pause/status/reset untuk histori dividen.

Kedua runner memakai state module-level `isActive` dan delay 300ms per emiten untuk mengurangi risiko rate limit.
