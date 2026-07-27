// src/db/index.ts
import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, readFileSync } from "fs";
import fs from "node:fs";
import path from "path";
import type { CountResult, RawStockData } from "../types";

/**
 * Mendapatkan lokasi folder 'data' secara dinamis:
 * 1. Saat development / test: Selalu mengunci ke root project (/data).
 * 2. Saat diproduksi sebagai compiled binary: Menggunakan direktori persis di samping binary executable.
 */
function resolveDataDir(): string {
  // A. Deteksi saat berjalan dari source code (Development, Bun Test, CLI Dev)
  const currentSourceDir = import.meta.dir;

  // Cek apakah berjalan dari source file (bukan virtual filesystem Bun binary)
  if (
    currentSourceDir &&
    !currentSourceDir.startsWith("$bunfs") &&
    !currentSourceDir.includes("#bun")
  ) {
    // Posisi file ini: <root>/src/db -> naik 2 level ke <root>
    const projectRoot = path.resolve(currentSourceDir, "../..");
    return path.join(projectRoot, "data");
  }

  // B. Fallback saat dijalankan sebagai compiled standalone binary (Release)
  const entryPath = process.argv[1] || process.execPath;

  let baseDir = process.cwd();
  try {
    const realPath = fs.realpathSync(entryPath);
    baseDir = path.dirname(realPath);

    // Jika binary/entry berada di dalam subfolder dev (src, test, scripts)
    if (["src", "test", "scripts"].includes(path.basename(baseDir))) {
      baseDir = path.resolve(baseDir, "..");
    }
  } catch {
    baseDir = process.cwd();
  }

  return path.join(baseDir, "data");
}

const dataDir = resolveDataDir();

// State internal untuk Lazy Initialization
let _dbInstance: Database | null = null;
let _isInitialized = false;

/**
 * Menyiapkan skema database dan melakukan seeding data awal dari JSON secara terisolasi
 */
function setupSchemaAndSeed(database: Database): void {
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

  // 2. Seeding Data Emiten Jika Kosong
  const countResult = database
    .query("SELECT COUNT(*) as total FROM emiten")
    .get() as CountResult | undefined;

  if (!countResult || countResult.total === 0) {
    console.error(
      "[DB] Tabel emiten kosong. Memulai inisialisasi dari JSON...",
    );
    const jsonPath = path.join(dataDir, "all_stocks.json");

    if (existsSync(jsonPath)) {
      try {
        const rawText = readFileSync(jsonPath, "utf-8");
        const allStocks = JSON.parse(rawText) as RawStockData[];

        if (Array.isArray(allStocks)) {
          const now = new Date().toISOString();
          const defaultPastDate = "2000-01-01 00:00:00";

          const insertStmt = database.prepare(`
            INSERT OR IGNORE INTO emiten (code, name, sector, notation, last_price, price_updated_at, fundamental_updated_at, created_at, updated_at)
            VALUES ($code, $name, $sector, $notation, 0, $past, $past, $now, $now)
          `);

          const insertTransaction = database.transaction(
            (stocks: RawStockData[]) => {
              for (const s of stocks) {
                insertStmt.run({
                  $code: s.code,
                  $name: s.name,
                  $sector: s.sector || "Unknown",
                  $notation: s.notation || null,
                  $past: defaultPastDate,
                  $now: now,
                });
              }
            },
          );

          insertTransaction(allStocks);
          console.error(
            `[DB] Berhasil menginisialisasi ${allStocks.length} daftar emiten dari ${jsonPath}.`,
          );
        }
      } catch (error) {
        console.error(
          "[DB] Terjadi kesalahan saat inisialisasi database:",
          error,
        );
      }
    } else {
      console.error(
        `[DB] Gagal inisialisasi: File tidak ditemukan di ${jsonPath}`,
      );
    }
  }

  // 3. Skema Stock Histories
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
 * Mengambil atau membuat koneksi instance SQLite secara Lazy
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
    _isInitialized = true; // Tandai di awal untuk mencegah rekursi jika ada query internal
    setupSchemaAndSeed(_dbInstance);
  }

  return _dbInstance;
}

// Proxy transparan: Menjaga sintaks `import db from "../db"` tetap bekerja 100% tanpa mengubah kode lain
export const db = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export default db;
