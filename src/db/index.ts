// src/db/index.ts
import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import path from "path";
import type { CountResult, RawStockData } from "../types";

if (!existsSync("data")) {
  mkdirSync("data");
}

const db = new Database("data/saham.db");

// 2. Pastikan tabel terbuat (Skema Emiten)
db.run(`
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
    fundamental_updated_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_emiten_sector ON emiten(sector);
`);

async function initializeAllStocks(database: Database): Promise<void> {
  // Cek apakah tabel emiten masih kosong dengan type casting yang jelas
  const countResult = database
    .query("SELECT COUNT(*) as total FROM emiten")
    .get() as CountResult | undefined;

  if (countResult && countResult.total > 0) {
    return; // Sudah ada data, lewati inisialisasi
  }

  console.log("[DB] Tabel emiten kosong. Memulai inisialisasi dari JSON...");
  const jsonPath = path.join(process.cwd(), "data", "all_stocks.json");

  if (!existsSync(jsonPath)) {
    console.error(
      `[DB] Gagal inisialisasi: File tidak ditemukan di ${jsonPath}`,
    );
    return;
  }

  try {
    const fileContent = Bun.file(jsonPath);
    const allStocks = JSON.parse(await fileContent.text()) as RawStockData[];

    if (Array.isArray(allStocks)) {
      const now = new Date().toISOString();
      const defaultPastDate = "2000-01-01 00:00:00";

      // Siapkan statement SQL untuk INSERT
      const insertStmt = database.prepare(`
        INSERT OR IGNORE INTO emiten (code, name, sector, notation, last_price, price_updated_at, fundamental_updated_at, created_at, updated_at)
        VALUES ($code, $name, $sector, $notation, 0, $past, $past, $now, $now)
      `);

      // Menggunakan database.transaction() dengan type definition untuk parameter stocks
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

      // Jalankan transaksi
      insertTransaction(allStocks);
      console.log(
        `[DB] Berhasil menginisialisasi ${allStocks.length} daftar emiten.`,
      );
    }
  } catch (error) {
    console.error("[DB] Terjadi kesalahan saat inisialisasi database:", error);
  }
}

// 3. Manfaatkan Top-Level Await bawaan Bun agar seeding selesai sebelum tabel history dibuat
await initializeAllStocks(db);

// Skema untuk stock_histories
db.run(`
  CREATE TABLE IF NOT EXISTS stock_histories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emiten_id INTEGER NOT NULL,
    period TEXT CHECK(period IN ('Q1', 'Q2', 'Q3', 'Q4', 'FY')) DEFAULT 'FY',
    year INTEGER NOT NULL,
    revenue TEXT,
    net_profit TEXT,
    eps NUMERIC DEFAULT 0.00,
    roe NUMERIC DEFAULT 0.00,
    der NUMERIC DEFAULT 0.00,
    pbv NUMERIC DEFAULT 0.00,
    per NUMERIC DEFAULT 0.00,
    operating_income NUMERIC DEFAULT 0.00,
    ebitda NUMERIC DEFAULT 0.00,
    free_cash_flow NUMERIC DEFAULT 0.00,
    capital_expenditure NUMERIC DEFAULT 0.00,
    interest_expense NUMERIC DEFAULT 0.00,
    total_assets NUMERIC DEFAULT 0.00,
    total_debt NUMERIC DEFAULT 0.00,
    cash NUMERIC DEFAULT 0.00,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY(emiten_id) REFERENCES emiten(id) ON DELETE CASCADE,
    UNIQUE(emiten_id, period, year)
  );
  CREATE INDEX IF NOT EXISTS idx_histories_emiten_year ON stock_histories(emiten_id, year);
`);

export default db;
