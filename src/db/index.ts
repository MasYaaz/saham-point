// src/db/index.ts
import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import fs from "node:fs";
import path from "path";
import type { CountResult, RawStockData } from "../types";
import { safeLog } from "../utils/safeLog";

/**
 * Mendapatkan lokasi folder 'data' secara dinamis
 */
function resolveDataDir(): string {
  const entryPoint = process.argv[1] || "";

  // 1. Cek apakah dijalankan langsung sebagai script TS/JS (Development)
  const isDevelopment =
    entryPoint.endsWith(".ts") || entryPoint.endsWith(".js");

  if (isDevelopment && import.meta.dir) {
    // Mundur dari src/db ke root proyek
    const projectRoot = path.resolve(import.meta.dir, "../..");
    return path.join(projectRoot, "data");
  }

  // 2. Jika dijalankan sebagai Binary Standalone (saham-point-cli)
  try {
    const binaryPath = fs.realpathSync(entryPoint || process.execPath);
    const binaryDir = path.dirname(binaryPath);
    return path.join(binaryDir, "data");
  } catch {
    return path.join(process.cwd(), "data");
  }
}

const dataDir = resolveDataDir();

let _dbInstance: Database | null = null;
let _isInitialized = false;

/**
 * Helper: Fetch seluruh emiten IHSG dari TradingView Screener API
 */
async function fetchTradingViewStocks(): Promise<RawStockData[]> {
  const url = "https://scanner.tradingview.com/indonesia/scan";
  const payload = {
    filter: [
      {
        left: "type",
        operation: "in_range",
        right: ["stock", "dr", "fund"],
      },
    ],
    options: { lang: "en" },
    markets: ["indonesia"],
    columns: ["name", "description", "sector", "close"],
    sort: { sortBy: "name", sortOrder: "asc" },
    range: [0, 1500], // Menjangkau seluruh emiten IHSG (~900+ emiten)
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`TradingView Screener HTTP Error: ${res.status}`);
  }

  const result = (await res.json()) as {
    data: Array<{
      s: string;
      d: [string, string, string | null, number | null];
    }>;
  };

  if (!result.data || !Array.isArray(result.data)) {
    return [];
  }

  return result.data.map((item) => {
    const code = item.d[0] || item.s.replace("IDX:", "");
    return {
      code,
      name: item.d[1] || code,
      sector: item.d[2] || "Unknown",
      notation: "",
      last_price: item.d[3] ?? 0,
    };
  });
}

/**
 * Menyiapkan skema database (Synchronous)
 */
function setupSchema(database: Database): void {
  database.run("PRAGMA journal_mode = WAL;");
  database.run("PRAGMA busy_timeout = 5000;");

  // 1. Skema Emiten
  database.run(`
    CREATE TABLE IF NOT EXISTS emiten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      sector TEXT NOT NULL DEFAULT 'Unknown',
      description TEXT NOT NULL DEFAULT '',
      notation TEXT NOT NULL DEFAULT '',
      last_price NUMERIC NOT NULL DEFAULT 0.00,
      previous_close NUMERIC NOT NULL DEFAULT 0.00,
      day_high NUMERIC NOT NULL DEFAULT 0.00,
      day_low NUMERIC NOT NULL DEFAULT 0.00,
      market_cap NUMERIC NOT NULL DEFAULT 0.00,
      pbv NUMERIC NOT NULL DEFAULT 0.00,
      per NUMERIC NOT NULL DEFAULT 0.00,
      roe NUMERIC NOT NULL DEFAULT 0.00,
      der NUMERIC NOT NULL DEFAULT 0.00,
      dividend NUMERIC NOT NULL DEFAULT 0.00,
      dividend_yield NUMERIC NOT NULL DEFAULT 0.00,
      beta NUMERIC NOT NULL DEFAULT 1.00,
      price_updated_at TEXT NOT NULL DEFAULT '',
      is_profile_complete INTEGER NOT NULL DEFAULT 0,
      is_fundamental_complete INTEGER NOT NULL DEFAULT 0,
      fundamental_updated_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_emiten_sector ON emiten(sector);
    CREATE INDEX IF NOT EXISTS idx_emiten_profile_complete ON emiten(is_profile_complete);
    CREATE INDEX IF NOT EXISTS idx_emiten_fundamental_complete ON emiten(is_fundamental_complete);
  `);

  // 2. Skema Stock Histories
  database.run(`
    CREATE TABLE IF NOT EXISTS stock_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emiten_id INTEGER NOT NULL,
      period TEXT CHECK(period IN ('Q1', 'Q2', 'Q3', 'Q4', 'FY')) DEFAULT 'FY',
      year INTEGER NOT NULL,

      -- Income Statement
      revenue TEXT,
      gross_profit NUMERIC DEFAULT 0.00,
      operating_income NUMERIC DEFAULT 0.00,
      ebit NUMERIC DEFAULT 0.00,
      net_profit TEXT,
      eps NUMERIC DEFAULT 0.00,
      average_basic_shares_outstanding NUMERIC DEFAULT 0.00,
      ebitda NUMERIC DEFAULT 0.00,

      -- Balance Sheet
      total_assets NUMERIC DEFAULT 0.00,
      total_liabilities NUMERIC DEFAULT 0.00,
      total_equity NUMERIC DEFAULT 0.00,
      total_debt NUMERIC DEFAULT 0.00,
      net_debt NUMERIC DEFAULT 0.00,

      -- Cash Flow
      cash_flow_operating NUMERIC DEFAULT 0.00,
      cash_flow_investing NUMERIC DEFAULT 0.00,
      cash_flow_financing NUMERIC DEFAULT 0.00,
      free_cash_flow NUMERIC DEFAULT 0.00,

      -- Ratios & Valuation
      roe NUMERIC DEFAULT 0.00,
      der NUMERIC DEFAULT 0.00,
      pbv NUMERIC DEFAULT 0.00,
      per NUMERIC DEFAULT 0.00,

      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY(emiten_id) REFERENCES emiten(id) ON DELETE CASCADE,
      UNIQUE(emiten_id, period, year)
    );

    CREATE INDEX IF NOT EXISTS idx_histories_emiten_year ON stock_histories(emiten_id, year);
  `);
}

/**
 * Seeding data emiten jika database masih kosong (Asynchronous)
 */
export async function seedEmitenIfEmpty(database: Database): Promise<void> {
  const countResult = database
    .query("SELECT COUNT(*) as total FROM emiten")
    .get() as CountResult | undefined;

  if (!countResult || countResult.total === 0) {
    safeLog(
      "error",
      "[DB] Tabel emiten kosong. Memulai seeding langsung dari TradingView Screener...",
    );

    try {
      const allStocks = await fetchTradingViewStocks();

      if (allStocks.length > 0) {
        const now = new Date().toISOString();
        const defaultPastDate = "2000-01-01 00:00:00";

        const insertStmt = database.prepare(`
          INSERT OR IGNORE INTO emiten (code, name, sector, notation, last_price, price_updated_at, fundamental_updated_at, created_at, updated_at)
          VALUES ($code, $name, $sector, $notation, $last_price, $past, $past, $now, $now)
        `);

        const insertTransaction = database.transaction(
          (stocks: RawStockData[]) => {
            for (const s of stocks) {
              insertStmt.run({
                $code: s.code,
                $name: s.name,
                $sector: s.sector || "Unknown",
                $notation: s.notation || "",
                $last_price: s.last_price || 0,
                $past: defaultPastDate,
                $now: now,
              });
            }
          },
        );

        insertTransaction(allStocks);
        safeLog(
          "log",
          `[DB] Berhasil menginisialisasi ${allStocks.length} emiten dari TradingView.`,
        );
      }
    } catch (error) {
      safeLog(
        "error",
        `[DB] Terjadi kesalahan saat inisialisasi dari TradingView: ${error}`,
      );
    }
  }
}

/**
 * Mengambil koneksi instance SQLite
 */
export function getDb(): Database {
  if (!_dbInstance) {
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, "saham.db");
    _dbInstance = new Database(dbPath);
  }

  if (!_isInitialized) {
    _isInitialized = true;
    setupSchema(_dbInstance);
    // Jalankan seeding async di background jika tabel masih kosong
    seedEmitenIfEmpty(_dbInstance).catch((err) =>
      console.error("[DB] Background seed error:", err),
    );
  }

  return _dbInstance;
}

// Proxy transparan
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export default db;
