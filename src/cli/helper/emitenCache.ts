import db from "../../db";

let emitenCache: string[] = [];

function loadEmitenCache(): string[] {
  try {
    const rows = db.query("SELECT code FROM emiten").all() as {
      code: string;
    }[];
    return rows.map((r) => r.code.toUpperCase());
  } catch {
    return []; // Fallback aman jika tabel belum ready
  }
}

emitenCache = loadEmitenCache();

/**
 * Panggil ini setelah sync selesai (misal di `finally` pada handleSync)
 * supaya emiten baru langsung dikenali autocomplete tanpa perlu restart proses.
 */
export function refreshEmitenCache(): void {
  emitenCache = loadEmitenCache();
}

export function matchEmitenCode(prefix: string): string | undefined {
  return emitenCache.find((code) => code.startsWith(prefix));
}
