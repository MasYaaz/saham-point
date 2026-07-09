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
  market_cap: number | null;
  beta: number | null;
  last_dividend: number | null;
  per: number | null;
  eps: number | null;
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

export interface TradingViewFinancialHistory {
  // --- 1. Ratios & Valuation (Dari Tab Statistics) ---
  roe?: number | null;
  der?: number | null;
  pbv?: number | null;
  per?: number | null;

  // --- 2. Income Statement (Laporan Laba Rugi - Tabel 1) ---
  revenue?: number | null; // Total revenue
  cost_of_goods_sold?: number | null; // Cost of goods sold
  gross_profit?: number | null; // Gross profit
  operating_expenses_excl_cogs?: number | null; // Operating expenses (excl. COGS)
  operating_income?: number | null; // Operating income
  equity_in_earnings?: number | null; // Equity in earnings
  operating_profit?: number | null; // Operating profit (EBIT)
  pretax_income?: number | null; // Pretax income
  income_tax?: number | null; // Taxes
  net_income_before_discontinued?: number | null; // Net income before discontinued operations
  discontinued_operations?: number | null; // Discontinued operations
  after_tax_other_income_expense?: number | null; // After tax other income/expense
  net_profit?: number | null; // Net income
  preferred_dividends?: number | null; // Preferred dividends
  diluted_net_income_to_common?: number | null; // Diluted net income available to common stockholders
  eps?: number | null; // Basic earnings per share (basic EPS)
  diluted_eps?: number | null; // Diluted earnings per share (diluted EPS)
  average_basic_shares_outstanding?: number | null; // Average basic shares outstanding
  diluted_shares_outstanding?: number | null; // Diluted shares outstanding
  ebitda?: number | null; // EBITDA
  ebit?: number | null; // EBIT

  // --- 3. Balance Sheet (Neraca Keuangan - Tabel 2) ---
  total_assets?: number | null; // Total assets
  total_liabilities?: number | null; // Total liabilities
  total_equity?: number | null; // Total equity
  total_liabilities_and_equity?: number | null; // Total liabilities & shareholders' equities
  total_debt?: number | null; // Total debt
  net_debt?: number | null; // Net debt

  // --- 4. Cash Flow (Arus Kas - Tabel 3) ---
  cash_flow_operating?: number | null; // Cash flow from operating activities
  cash_flow_investing?: number | null; // Cash flow from investing activities
  cash_flow_financing?: number | null; // Cash flow from financing activities
  free_cash_flow?: number | null; // Free cash flow
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
