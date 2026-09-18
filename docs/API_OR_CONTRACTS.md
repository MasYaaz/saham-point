# API & Contracts

Dokumen ini memetakan kontrak yang benar-benar terdaftar di MCP tools dan service aktif. Semua tool MCP mengembalikan response dalam bentuk MCP `content`, umumnya:

```ts
{
  content: [
    {
      type: "text",
      text: string // biasanya JSON.stringify(payload, null, 2)
    }
  ]
}
```

Jika terjadi error, beberapa tool mengembalikan payload JSON `status: "error"`, beberapa mengembalikan text `[ERROR] ...`, dan `get_corporate_actions` juga dapat mengisi `isError: true`.

## Modul & Fitur Aktif

### Stock & News

- Pencarian kode emiten.
- Listing emiten lokal dan status kelengkapan fundamental.
- Profil emiten plus histori laporan keuangan.
- Indikator teknikal berbasis candle Yahoo Finance.
- Pencarian berita Google News RSS plus ekstraksi konten artikel.

### Market

- Kalender/riwayat corporate action dari cache KSEI.
- Market overview IDX: indeks, top gainers, top losers, top value, top volume.
- Daftar emiten per sektor IDX.

### Bandarmology

- Broker summary/net buy/net sell broker dari Stockbit.
- Foreign flow dari trading summary IDX.

### Screener

- Undervalued/value investing.
- Market cap.
- Momentum teknikal: breakout, reversal, volatile.
- Dividend screener.
- Cash rich.
- Growth.
- Ranking market cap/dividend yield.
- Gorengan/spekulatif berbasis UMA, anomali fundamental, volume spike, dan return 5 hari.

### Analyzer & Sync

- Analisis dividen per emiten.
- Kontrol sync histori fundamental.
- Kontrol sync histori dividen.
- Manajemen log sistem.

## Inventory MCP Tools

### Core Tools

| Tool | Input | Output |
| --- | --- | --- |
| `manage_stock_histories_sync` | `action: "start" \| "pause" \| "status" \| "reset"`; `code?: string` untuk reset emiten spesifik. | Text status untuk start/pause/reset. Untuk `status`: JSON `{ is_active, unprocessed_emiten_count, status }`. |
| `manage_dividend_histories_sync` | `action: "start" \| "pause" \| "status" \| "reset"`; `code?: string` untuk reset emiten spesifik. | Text status untuk start/pause/reset. Untuk `status`: JSON `{ is_active, unprocessed_emiten_count, status }`. |
| `manage_system_logs` | `action: "show" \| "list" \| "clean"`; `target?: string = "today"`; `lines?: number = 20`. | JSON dari `getLogs`, `listLogFiles`, atau `cleanLogs`. |

### Stock Tools

| Tool | Input | Output |
| --- | --- | --- |
| `search_stock_code` | `query: string`; `limit?: number = 10`. | JSON `{ query, total, data }` atau `{ query, total: 0, message, data: [] }`. `data` berisi `{ code, name, sector }`. |
| `list_emiten` | `limit?: number = 100`; `search?: string`. | JSON `{ total_fetched, data }`. Data berisi `id`, `code`, `name`, `sector`, `is_profile_complete`, `is_fundamental_complete`, `fundamental_updated_at`. |
| `get_stock_profile` | `code: string`. | JSON profil emiten dari tabel `emiten` plus `histories` dari `stock_histories`, atau message ticker tidak ditemukan. |
| `get_technical_indicators` | `code: string`; `range?: string = "1y"` dengan nilai seperti `1mo`, `3mo`, `6mo`, `1y`, `2y`. | JSON `{ code, meta, indicators }`. `indicators` berisi `summary_signals`, moving averages, oscillators, trend/volatility, dan volume indicators. |
| `search_news` | `query: string`; `maxDays?: number = 30`; `limit?: number = 10`; `lang?: "id" \| "en" = "id"`. | JSON `{ query, total, data }`. Item berita: `{ title, url, published, source, content }`. |

### Market Tools

| Tool | Input | Output |
| --- | --- | --- |
| `get_corporate_actions` | `code?: string`; `actionType?: enum KSEI`; `fromDate?: YYYY-MM-DD`; `toDate?: YYYY-MM-DD`; `limit?: number = 100` max 500. | JSON `{ status, code, filterActionType, fromDate, toDate, returnedCount, totalMatches, data }`. `data` dikategorikan menjadi `cashDividends`, `stockDividends`, `mixedDividends`, `rightDistributions`, `proxyVotings`, `redemptions`, `mandatoryConversions`, `voluntaryConversions`, `otherActions`. |
| `get_market_overview` | `date?: YYYY-MM-DD`. | JSON `{ status, date, indices, topGainers, topLosers, topValue, topVolume }` atau `{ status: "error", message }`. |
| `get_sector_emiten` | `name: enum sektor IDX`. | JSON `{ status, sector, total, data }`. Data diurutkan dari `market_cap` terbesar. |

Sektor valid:

```text
Healthcare, Basic Materials, Financials, Transportation & Logistic,
Technology, Consumer Non-Cyclicals, Industrials, Energy,
Consumer Cyclicals, Infrastructures, Properties & Real Estate
```

### Bandarmology Tools

| Tool | Input | Output |
| --- | --- | --- |
| `get_broker_summary` | `code: string`; `startDate?: YYYY-MM-DD`; `endDate?: YYYY-MM-DD`. Default tanggal hari ini WIB. | JSON `{ status, code, range, bandarDetector, topAccumulationRatio, netBuyBrokers, netSellBrokers }`, atau status `empty`/`error`. |
| `get_foreign_flow` | `code: string`; `startDate?: YYYY-MM-DD`; `endDate?: YYYY-MM-DD`. Default tanggal hari ini WIB. | JSON `{ status, code, periodDays, range, cumulativeNetForeignValue, cumulativeNetForeignVolume, dailyFlows }`. |

### Screener Tools

| Tool | Input | Output |
| --- | --- | --- |
| `screener_undervalued` | `max_pbv?: number = 1.5`; `min_roe?: number = 10`; `max_der?: number = 2`; `limit?: number = 25`. | JSON `{ filter_applied, count, data }`. Data berisi emiten dengan PBV, PER, ROE, DER, dividend yield. |
| `screener_market_cap` | `min_market_cap?: number = 0`; `max_market_cap?: number \| null`; `sort?: string = "desc"`; `limit?: number = 25`. | JSON `{ filter_applied, count, data }`. |
| `screener_technical` | `strategy?: string = "breakout"`; `limit?: number = 30`. Strategy aktif: `breakout`, `reversal`, `volatile`; nilai lain fallback ke breakout. | JSON `{ strategy_applied, limit_applied, count, data }`, dengan `daily_change_percent` dan `day_range_percent`. |
| `screener_dividends` | `min_yield?: number = 5`; `max_dpr?: number = 100`; `min_streak?: number = 3`; `max_der?: number = 1.5`; `limit?: number = 25`. | JSON `{ filter_applied, count, data }`. Data berisi `ttm_dps`, `calculated_yield`, `latest_dpr`, `consecutive_years`. |
| `screener_cash_rich` | `limit?: number = 25`. | JSON `{ description, count, data }`. Data berasal dari laporan terakhir dengan FCF positif dan net debt negatif. |
| `screener_growth` | `limit?: number = 25`. | JSON `{ description, count, data }`. Data berisi laba bersih terbaru vs tahun sebelumnya. |
| `screener_rankings` | `sort?: string = "market_cap"`; `limit?: number = 25`. `sort = "dividend_yield"` memakai dividend yield, selain itu market cap. | JSON `{ metric, count, data }`. |
| `screener_gorengan` | `limit?: number`. | JSON `{ status: "success", usage_guidelines, total, data }`. Item berisi `gorengan_score`, `reasons`, rasio fundamental, dan `candle_signals`. |

### Analyzer Tools

| Tool | Input | Output |
| --- | --- | --- |
| `analyze_dividend` | `code: string`. | JSON `DividendAnalysisResult`: `{ code, name, last_price, ttm_dps, current_yield, cagr_3y, cagr_5y, consecutive_years_paid, safety_rating, safety_notes, annual_breakdown, latest_event }`. |

## Inventory Services

### Stock Services

| Fungsi | Input | Output |
| --- | --- | --- |
| `searchEmiten(query, limit)` | `query: string`, `limit?: number`. | `EmitenBasicInfo[]`. |
| `getEmitenProfile(code)` | `code: string`. | Profil emiten + `histories`, atau `null`. |
| `getEmitenHistories(code)` | `code: string`. | Array histori keuangan tahunan/kuartalan, atau `null`. |
| `getEmitenGrowth(code)` | `code: string`. | Array growth YoY revenue/net profit, atau `null`. |
| `getEmitenValuation(code)` | `code: string`. | Analisis PER vs rata-rata historis, atau `null`. |
| `getEmitenBySector(sectorName)` | `sectorName: string`. | `{ count, data }`. |

### Sync Services

| Fungsi | Input | Output |
| --- | --- | --- |
| `syncStockList()` | Tidak ada. | String ringkasan jumlah emiten disinkronkan. |
| `syncStockPrice()` | Tidak ada. | String `Total/Berhasil/Gagal`. |
| `syncStockData()` | Tidak ada. | String `Total/Berhasil/Gagal`. |
| `syncCorporateActions()` | Tidak ada. | String ringkasan mode sync KSEI, periode, jumlah API, jumlah insert, dan hasil sync dividen event-driven. |
| `syncStockHistories(onProgress?)` | Callback opsional `(currentCount, totalQueue, code, status)`. | String ringkasan total/sukses/gagal/durasi. |
| `syncDividendHistories(onProgress?)` | Callback opsional `(currentCount, totalQueue, code, status)`. | String ringkasan total/sukses/gagal/durasi. |
| `syncDailyDividendFromCA(targetCodes?)` | `targetCodes?: string[]`. | `{ totalTarget, successCount, failCount, syncedCodes }`. |

### External Fetch Services

| Fungsi | Input | Output |
| --- | --- | --- |
| `fetchPriceTradingView(items)` | `EmitenItem[]`. | `{ successCount, failCount }`, update DB `emiten`. |
| `fetchFullMarketDataTradingView(items)` | `EmitenItem[]`. | `{ successCount, failCount }`, update profil/harga/fundamental ringkas. |
| `fetchStockHistories(symbol)` | Symbol TradingView seperti `IDX:BBCA`. | `{ symbol, by_quarter, by_fy }`. |
| `fetchDividendHistories(symbol)` | Symbol TradingView seperti `IDX:BBCA`. | `{ symbol, total_events, data }`. |
| `fetchYahooCandles(code, range)` | `code: string`, `range?: string`. | `{ meta, ticker, interval, history }` atau `null`. |
| `getMarketOverview(date?)` | `date?: string` atau `string[]`. | Market overview tunggal atau array. |
| `getForeignFlow(input)` | `{ code, dates: string[] }` dengan tanggal `YYYYMMDD`. | Foreign flow kumulatif dan harian. |
| `getActiveUmaStocks(daysBack?)` | `daysBack?: number = 90`. | Daftar UMA unik. |
| `getBroxsum(input)` | `{ ticker, fromDate, toDate, limit? }`. | Broker summary compact. |
| `searchNews(query, time, limit, lang)` | `query`, umur hari, limit, bahasa. | `NewsItem[]`. |

## Sumber Data Eksternal

| Sumber | Endpoint/Transport | Modul Client/Service | Catatan |
| --- | --- | --- | --- |
| TradingView Scanner | `https://scanner.tradingview.com/indonesia/scan` REST POST | `TradingViewClient`, `fetchScreener.ts`, `syncStockList.ts` | Daftar emiten, harga, rasio ringkas, market cap, dividend. |
| TradingView Financials | `wss://data.tradingview.com/socket.io/websocket` | `fetchStockHistories.ts` | Fundamental kuartalan/tahunan via field `_fq_h` dan `_fy_h`. |
| TradingView Dividends | `wss://data.tradingview.com/socket.io/websocket` | `fetchDividendHistories.ts` | Event dividen historis. |
| Yahoo Finance | `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}` | `YahooClient`, `fetchCandle.ts` | Candle OHLCV; ticker IDX memakai suffix `.JK`, IHSG memakai `^JKSE`. |
| IDX/BEI | `https://www.idx.co.id/primary/home/GetIndexList` | `IdxClient`, `marketOverview.ts` | Data indeks. |
| IDX/BEI | `https://www.idx.co.id/primary/TradingSummary/GetStockSummary` | `IdxClient`, `marketOverview.ts`, `foreignFlow.ts` | Stock summary, top movers, foreign buy/sell. |
| IDX/BEI | `https://www.idx.co.id/primary/NewsAnnouncement/GetUma` | `IdxClient`, `getUMA.ts` | Pengumuman UMA. |
| KSEI | `https://www.ksei.co.id/api/corporate_actions` | `KseiClient`, `syncCorporateAction.ts` | Corporate action per tanggal/rentang tanggal. |
| Stockbit Exodus | `https://exodus.stockbit.com/marketdetectors/{ticker}` | `StockbitClient`, `fetchBroxSum.ts` | Broker summary; butuh `STOCKBIT_BEARER_TOKEN`. |
| Stockbit Exodus | `https://exodus.stockbit.com/login/refresh` | `refreshStockbitToken.ts` | Refresh bearer token; dapat menulis token baru ke `.env`. |
| Google News RSS | `https://news.google.com/rss/search` | `searchNews.ts` | Search berita. |
| Publisher article page | URL hasil decode Google News | `generateArticleContent.ts` | Fetch HTML memakai `curl` via `Bun.spawn`, lalu ekstraksi artikel. |

## Data Model Utama

### `emiten`

Menyimpan identitas, sektor, deskripsi, harga terakhir, previous close, high/low harian, market cap, PBV, PER, ROE, DER, dividend, dividend yield, beta, timestamp update, dan flag kelengkapan profile/fundamental/dividend.

### `stock_histories`

Menyimpan data laporan keuangan per emiten, period (`Q1`, `Q2`, `Q3`, `Q4`, `FY`) dan tahun: revenue, gross profit, operating income, EBIT, net profit, EPS, shares outstanding, EBITDA, aset, liabilitas, ekuitas, debt, net debt, arus kas, FCF, ROE, DER, PBV, PER.

### `dividend_histories`

Menyimpan event dividen per emiten: year, type (`INTERIM`, `FINAL`, `SPECIAL`), cash dividend, ex date, record date, payment date.

### `corporate_actions`

Menyimpan corporate action KSEI: security code/name, display name, type, tanggal-tanggal event, description. Dedupe memakai kombinasi `security_code`, `type_of_ca`, `record_date`, `distribution_date`.

### `sync_ca_history`

Checkpoint sync corporate action: tanggal terakhir, status, jumlah fetch/insert, error message, created_at.
