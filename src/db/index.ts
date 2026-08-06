// src/db/index.ts
import { Database } from "bun:sqlite";
import fs, { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { syncStockList } from "../services/syncStockService/syncStockList";

/**
 * Mendapatkan lokasi folder 'data' secara dinamis (Development vs Binary Standalone)
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
 * Menyiapkan skema database (Synchronous)
 */
function setupSchema(database: Database): void {
  // Pragma Optimizations
  database.run("PRAGMA journal_mode = WAL;");
  database.run("PRAGMA busy_timeout = 5000;");
  database.run("PRAGMA foreign_keys = ON;");

  // Skema Emiten
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
       is_dividend_complete INTEGER NOT NULL DEFAULT 0,
       dividend_updated_at TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL DEFAULT '',
       updated_at TEXT NOT NULL DEFAULT ''
     );
     CREATE INDEX IF NOT EXISTS idx_emiten_sector ON emiten(sector);
     CREATE INDEX IF NOT EXISTS idx_emiten_profile_complete ON emiten(is_profile_complete);
     CREATE INDEX IF NOT EXISTS idx_emiten_fundamental_complete ON emiten(is_fundamental_complete);
     CREATE INDEX IF NOT EXISTS idx_emiten_dividend_complete ON emiten(is_dividend_complete);
   `);

  // Skema Stock Histories
  database.run(`
     CREATE TABLE IF NOT EXISTS stock_histories (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       emiten_id INTEGER NOT NULL,
       period TEXT CHECK(period IN ('Q1', 'Q2', 'Q3', 'Q4', 'FY')) DEFAULT 'FY',
       year INTEGER NOT NULL,

       -- Income Statement
       revenue NUMERIC DEFAULT 0.00,
       gross_profit NUMERIC DEFAULT 0.00,
       operating_income NUMERIC DEFAULT 0.00,
       ebit NUMERIC DEFAULT 0.00,
       net_profit NUMERIC DEFAULT 0.00,
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

  // Skema Dividend Histories
  database.run(`
      CREATE TABLE IF NOT EXISTS dividend_histories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        emiten_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        type TEXT CHECK(type IN ('INTERIM', 'FINAL', 'SPECIAL')) DEFAULT 'FINAL',

        -- Nominal & Tanggal Utama
        cash_dividend NUMERIC NOT NULL DEFAULT 0.00, -- Nominal DPS (Rp per lembar)
        ex_date TEXT NOT NULL DEFAULT '',            -- Format ISO 'YYYY-MM-DD'
        record_date TEXT NOT NULL DEFAULT '',        -- Format ISO 'YYYY-MM-DD'
        payment_date TEXT NOT NULL DEFAULT '',       -- Format ISO 'YYYY-MM-DD'

        FOREIGN KEY(emiten_id) REFERENCES emiten(id) ON DELETE CASCADE,
        -- Mencegah duplikasi event dividen sejenis untuk emiten & tanggal yang sama
        UNIQUE(emiten_id, ex_date, type)
      );

      CREATE INDEX IF NOT EXISTS idx_div_emiten_id ON dividend_histories(emiten_id);
      CREATE INDEX IF NOT EXISTS idx_div_year ON dividend_histories(year);
      CREATE INDEX IF NOT EXISTS idx_div_ex_date ON dividend_histories(ex_date);
    `);

  // Skema Corporate Actions
  database.run(`
     CREATE TABLE IF NOT EXISTS corporate_actions (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       security_code TEXT NOT NULL,
       security_name TEXT NOT NULL DEFAULT '',
       display_name TEXT NOT NULL DEFAULT '',
       type_of_ca TEXT NOT NULL,

       -- Tanggal Aksi Korporasi (Format ISO String 'YYYY-MM-DD HH:MM:SS')
       cum_date TEXT NOT NULL DEFAULT '',
       record_date TEXT NOT NULL DEFAULT '',
       effective_date TEXT NOT NULL DEFAULT '',
       start_date TEXT NOT NULL DEFAULT '',
       end_date TEXT NOT NULL DEFAULT '',
       distribution_date TEXT NOT NULL DEFAULT '',

       description TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL DEFAULT '',
       updated_at TEXT NOT NULL DEFAULT '',

       -- Mencegah duplikasi data saat sync berulang
       UNIQUE(security_code, type_of_ca, record_date, distribution_date)
     );

     CREATE INDEX IF NOT EXISTS idx_ca_security_code ON corporate_actions(security_code);
     CREATE INDEX IF NOT EXISTS idx_ca_type ON corporate_actions(type_of_ca);
     CREATE INDEX IF NOT EXISTS idx_ca_record_date ON corporate_actions(record_date);
   `);

  // Skema Sync CA History
  database.run(`
     CREATE TABLE IF NOT EXISTS sync_ca_history (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       last_synced_date TEXT NOT NULL DEFAULT '',
       status TEXT NOT NULL DEFAULT 'SUCCESS', -- 'SUCCESS', 'FAILED', 'IN_PROGRESS'
       total_fetched INTEGER NOT NULL DEFAULT 0,
       total_inserted INTEGER NOT NULL DEFAULT 0,
       error_message TEXT NOT NULL DEFAULT '',
       created_at TEXT NOT NULL DEFAULT ''
     );

     CREATE INDEX IF NOT EXISTS idx_sync_ca_status ON sync_ca_history(status);
     CREATE INDEX IF NOT EXISTS idx_sync_ca_last_synced ON sync_ca_history(last_synced_date);
   `);
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
    // Sync stock list secara background jika dipanggil pertama kali
    syncStockList().catch((err) =>
      console.error("[DB] Background seed error:", err),
    );
  }

  return _dbInstance;
}

// Proxy transparan untuk eksekusi db query langsung
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export default db;
