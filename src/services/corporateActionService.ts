import db from "../db";

/**
 * Model data record aksi korporasi yang tersimpan di database.
 */
interface CorporateActionRecord {
  id: number;
  security_code: string;
  security_name: string;
  display_name: string;
  type_of_ca: string;
  cum_date: string;
  record_date: string;
  effective_date: string;
  start_date: string;
  end_date: string;
  distribution_date: string;
  description: string;
  created_at: string;
  updated_at: string;
}

/**
 * Opsi filter untuk pencarian fleksibel aksi korporasi.
 */
interface CorporateActionFilterOptions {
  securityCode?: string;
  typeOfCa?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Service Data Access Object (DAO) untuk membaca data aksi korporasi dari database.
 */
export class CorporateActionService {
  /**
   * Mengambil daftar aksi korporasi untuk satu emiten tertentu.
   *
   * @param securityCode Kode emiten saham (contoh: 'BBCA', 'TLKM')
   * @param limit Jumlah maksimal record yang dikembalikan (default: 50)
   * @returns Array data aksi korporasi terurut dari tanggal terbaru
   */
  getBySecurityCode(securityCode: string, limit = 50): CorporateActionRecord[] {
    const code = securityCode.trim().toUpperCase();
    return db
      .query(
        `
        SELECT *
        FROM corporate_actions
        WHERE security_code = ?
        ORDER BY
          CASE WHEN record_date != '' THEN record_date ELSE cum_date END DESC,
          id DESC
        LIMIT ?
      `,
      )
      .all(code, limit) as CorporateActionRecord[];
  }

  /**
   * Mengambil data aksi korporasi berdasarkan rentang tanggal `record_date` (cocok untuk tampilan Kalender).
   *
   * @param startDate Tanggal awal rentang ISO string 'YYYY-MM-DD'
   * @param endDate Tanggal akhir rentang ISO string 'YYYY-MM-DD'
   * @returns Array aksi korporasi dalam rentang tanggal
   */
  getByDateRange(startDate: string, endDate: string): CorporateActionRecord[] {
    return db
      .query(
        `
        SELECT *
        FROM corporate_actions
        WHERE record_date >= ? AND record_date <= ?
        ORDER BY record_date ASC, security_code ASC
      `,
      )
      .all(startDate, endDate) as CorporateActionRecord[];
  }

  /**
   * Mengambil agenda aksi korporasi mendatang (Upcoming Events) mulai hari ini hingga N hari ke depan.
   *
   * @param daysAhead Jumlah hari masa depan yang diproyeksikan (default: 30 hari)
   * @returns Array aksi korporasi mendatang terurut dari tanggal terdekat
   */
  getUpcomingActions(daysAhead = 30): CorporateActionRecord[] {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const future = new Date();
    future.setDate(now.getDate() + daysAhead);
    const targetDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;

    return db
      .query(
        `
        SELECT *
        FROM corporate_actions
        WHERE record_date >= ? AND record_date <= ?
        ORDER BY record_date ASC, security_code ASC
      `,
      )
      .all(today, targetDate) as CorporateActionRecord[];
  }

  /**
   * Mengambil khusus riwayat dividen untuk satu saham spesifik.
   *
   * @param securityCode Kode emiten saham (contoh: 'BBCA')
   * @returns Array aksi korporasi bertipe Dividen
   */
  getDividendHistory(securityCode: string): CorporateActionRecord[] {
    const code = securityCode.trim().toUpperCase();
    return db
      .query(
        `
        SELECT *
        FROM corporate_actions
        WHERE security_code = ?
          AND (type_of_ca LIKE '%DIVIDEND%' OR type_of_ca LIKE '%DIVIDEN%')
        ORDER BY record_date DESC
      `,
      )
      .all(code) as CorporateActionRecord[];
  }

  /**
   * Pencarian dinamis aksi korporasi dengan kriteria filter opsional dan paginasi.
   *
   * @param options Parameter opsi filter dan pagination
   * @returns Objek berisi array data dan total baris terfilter
   */
  findMany(options: CorporateActionFilterOptions = {}): {
    data: CorporateActionRecord[];
    total: number;
  } {
    const {
      securityCode,
      typeOfCa,
      startDate,
      endDate,
      limit = 20,
      offset = 0,
    } = options;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    // Construct klausa WHERE secara dinamis
    if (securityCode) {
      conditions.push("security_code = ?");
      params.push(securityCode.trim().toUpperCase());
    }

    if (typeOfCa) {
      conditions.push("type_of_ca = ?");
      params.push(typeOfCa);
    }

    if (startDate) {
      conditions.push("record_date >= ?");
      params.push(startDate);
    }

    if (endDate) {
      conditions.push("record_date <= ?");
      params.push(endDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Hitung total records untuk paginasi UI
    const countResult = db
      .query(`SELECT COUNT(*) as count FROM corporate_actions ${whereClause}`)
      .get(...params) as { count: number } | null;

    const total = countResult?.count || 0;

    // 2. Ambil data terpaginasi
    const data = db
      .query(
        `
        SELECT *
        FROM corporate_actions
        ${whereClause}
        ORDER BY record_date DESC, id DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(...params, limit, offset) as CorporateActionRecord[];

    return { data, total };
  }
}

export default new CorporateActionService();
