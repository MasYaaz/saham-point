// 1. Definisikan Interface untuk Type Safety data dari JSON
export interface RawStockData {
  code: string;
  name: string;
  sector?: string;
  notation?: string;
}

export interface CountResult {
  total: number;
}

// Interface pendukung typing data emiten (Disesuaikan dengan kolom bursa & database)
export interface EmitenItem {
  id: number;
  code: string;
  description: string | null;
  last_price: number; // Tambahkan ini karena dipakai di rumus divYield stock.last_price
  previous_close?: number; // Optional pendukung update price
  day_high?: number; // Optional pendukung update price
  day_low?: number; // Optional pendukung update price
  market_cap?: number;
  dividend?: number;
  dividend_yield?: number;
  beta: number | null;
  pbv: number | null;
  per: number | null;
  roe: number | null;
  der: number | null;
  price_updated_at: string | null;
  fundamental_updated_at: string | null;
}

// Struktur data profil hasil parse dari halaman utama Yahoo
export interface ScrapedProfile {
  description: string | null;
  market_cap: number;
  beta: number;
  last_dividend: number;
  per: number;
  eps: number;
}

export interface YahooProfileData {
  description: string | null;
  market_cap: number;
  beta: number;
  last_dividend: number;
  per: number;
  eps: number;
}

export interface YahooFinancialHistory {
  revenue?: string;
  net_profit?: string;
  operating_income?: number; // Baru
  free_cash_flow?: number; // Baru
  capital_expenditure?: number; // Baru
  interest_expense?: number; // Baru
  eps?: number;
  ebitda?: number;
  total_assets?: number;
  total_equity?: number;
  total_debt?: number;
  cash?: number;
  roe?: number;
  der?: number;
  pbv?: number;
  per?: number;
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
