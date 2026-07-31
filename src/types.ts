// 1. Definisikan Interface untuk Type Safety data dari JSON
export interface RawStockData {
  code: string;
  name: string;
  sector?: string;
  notation?: string;
  last_price?: number;
}

export interface CountResult {
  total: number;
}

// Interface pendukung typing data emiten (Disesuaikan dengan kolom bursa & database)
export interface EmitenItem {
  id: number;
  code: string;
  name?: string;
  sector?: string;
  description: string | null;
  last_price: number;
  previous_close?: number;
  day_high?: number;
  day_low?: number;
  market_cap?: number | null; // Dibuat nullable karena bisa kosong
  dividend?: number | null;
  dividend_yield?: number | null;
  beta: number | null;
  pbv: number | null;
  per: number | null;
  roe: number | null;
  der: number | null;

  // Flag baru harus ditambahkan agar TypeScript tahu kolom ini ada
  is_profile_complete: number; // SQLite menyimpan boolean sebagai 0 atau 1
  is_fundamental_complete: number;

  price_updated_at: string | null;
  fundamental_updated_at: string | null;
  updated_at: string | null; // Penting untuk logika '-2 hours'
  created_at: string | null;
}

export interface TradingViewFinancialHistory {
  // --- 1. Ratios & Valuation (Dari Tab Statistics) ---
  roe?: number | null;
  der?: number | null;
  pbv?: number | null;
  per?: number | null;

  // --- 2. Income Statement (Laporan Laba Rugi - Tabel 1) ---
  revenue?: number | null; // Total revenue
  gross_profit?: number | null; // Gross profit
  operating_income?: number | null; // Operating income
  net_profit?: number | null; // Net income
  eps?: number | null; // Basic earnings per share (basic EPS)
  average_basic_shares_outstanding?: number | null; // Average basic shares outstanding
  ebitda?: number | null; // EBITDA
  ebit?: number | null; // EBIT

  // --- 3. Balance Sheet (Neraca Keuangan - Tabel 2) ---
  total_assets?: number | null; // Total assets
  total_liabilities?: number | null; // Total liabilities
  total_equity?: number | null; // Total equity
  total_debt?: number | null; // Total debt
  net_debt?: number | null; // Net debt

  // --- 4. Cash Flow (Arus Kas - Tabel 3) ---
  cash_flow_operating?: number | null; // Cash flow from operating activities
  cash_flow_investing?: number | null; // Cash flow from investing activities
  cash_flow_financing?: number | null; // Cash flow from financing activities
  free_cash_flow?: number | null; // Free cash flow
}

// Struktur data profil hasil parse dari halaman utama Yahoo
export interface ScrapedProfile {
  description: string | null;
  market_cap: number | null;
  beta: number | null;
  last_dividend: number | null;
  per: number | null;
  eps: number | null;
}

export interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        regularMarketPrice: number;
        previousClose: number;
        currency: string;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }>;
  };
}

// Sync type safety dengan interface database terbaru
export interface EmitenDbRow {
  id: number;
  code: string;
  name: string;
  sector: string;
  description: string | null;
  last_price: number;
  previous_close: number | null;
  day_high: number | null;
  day_low: number | null;
  market_cap: number | null;
  pbv: number | null;
  per: number | null;
  roe: number | null;
  der: number | null;
  dividend: number | null;
  dividend_yield: number | null;
  beta: number | null;
  price_updated_at: string | null;
  fundamental_updated_at: string | null;
}

// Interface data Candlestick murni
export interface CandleHistory {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface EmitenBasicInfo {
  code: string;
  name: string;
  sector?: string;
}

export interface GorenganSuspect {
  code: string;
  name: string;
  sector: string;
  last_price: number;
  market_cap: number | null;
  gorengan_score: number;
  reasons: string[];
  per: number | null;
  pbv: number | null;
  roe: number | null;
  candle_signals?: {
    volume_spike_ratio: number; // Misal 3.5x dari rata-rata 20 hari
    recent_5d_return_pct: number; // Kenaikan harga 5 hari terakhir (%)
  };
}
