import db from "../db";

/**
 * Model data record aksi korporasi yang tersimpan di database.
 */
export interface CorporateActionRecord {
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
}

/**
 * Opsi filter untuk pencarian fleksibel aksi korporasi.
 */
export interface CorporateActionFilterOptions {
  securityCode?: string;
  typeOfCa?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export class CorporateActionService {
  /**
   * Helper ekspresi SQL untuk sorting tanggal paling relevan.
   */
  private readonly dateSortExpr = `
    CASE
      WHEN record_date != '' THEN record_date
      WHEN cum_date != '' THEN cum_date
      WHEN effective_date != '' THEN effective_date
      WHEN distribution_date != '' THEN distribution_date
      ELSE id
    END
  `;

  /**
   * Mengambil daftar aksi korporasi untuk satu emiten tertentu.
   */
  getBySecurityCode(securityCode: string, limit = 50): CorporateActionRecord[] {
    const code = securityCode.trim().toUpperCase();
    return db
      .query(
        `
        SELECT *
        FROM corporate_actions
        WHERE security_code = ?
        ORDER BY ${this.dateSortExpr} DESC, id DESC
        LIMIT ?
      `,
      )
      .all(code, limit) as CorporateActionRecord[];
  }

  /**
   * Mengambil data aksi korporasi berdasarkan rentang tanggal.
   */
  getByDateRange(startDate: string, endDate: string): CorporateActionRecord[] {
    return db
      .query(
        `
        SELECT *
        FROM corporate_actions
        WHERE (
          (record_date != '' AND record_date >= ? AND record_date <= ?) OR
          (record_date = '' AND cum_date != '' AND cum_date >= ? AND cum_date <= ?) OR
          (record_date = '' AND cum_date = '' AND effective_date != '' AND effective_date >= ? AND effective_date <= ?)
        )
        ORDER BY ${this.dateSortExpr} ASC, security_code ASC
      `,
      )
      .all(
        startDate,
        endDate,
        startDate,
        endDate,
        startDate,
        endDate,
      ) as CorporateActionRecord[];
  }

  /**
   * Mengambil agenda aksi korporasi mendatang (Upcoming Events).
   */
  getUpcomingActions(daysAhead = 30): CorporateActionRecord[] {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const future = new Date();
    future.setDate(now.getDate() + daysAhead);
    const targetDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;

    return this.getByDateRange(today, targetDate);
  }

  /**
   * Mengambil khusus riwayat dividen untuk satu saham spesifik.
   */
  getDividendHistory(
    securityCode: string,
    limit = 50,
  ): CorporateActionRecord[] {
    const code = securityCode.trim().toUpperCase();
    return db
      .query(
        `
        SELECT *
        FROM corporate_actions
        WHERE security_code = ?
          AND (type_of_ca LIKE '%DIVIDEND%' OR type_of_ca LIKE '%DIVIDEN%')
        ORDER BY ${this.dateSortExpr} DESC, id DESC
        LIMIT ?
      `,
      )
      .all(code, limit) as CorporateActionRecord[];
  }

  /**
   * Pencarian dinamis aksi korporasi dengan kriteria filter fleksibel dan paginasi.
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

    if (securityCode && securityCode.trim() !== "") {
      conditions.push("security_code = ?");
      params.push(securityCode.trim().toUpperCase());
    }

    if (typeOfCa && typeOfCa.trim() !== "") {
      conditions.push("type_of_ca LIKE ?");
      params.push(`%${typeOfCa.trim().toUpperCase()}%`);
    }

    if (startDate && startDate.trim() !== "") {
      conditions.push(`
        (
          (record_date != '' AND record_date >= ?) OR
          (record_date = '' AND cum_date != '' AND cum_date >= ?) OR
          (record_date = '' AND cum_date = '' AND effective_date != '' AND effective_date >= ?)
        )
      `);
      params.push(startDate, startDate, startDate);
    }

    if (endDate && endDate.trim() !== "") {
      conditions.push(`
        (
          (record_date != '' AND record_date <= ?) OR
          (record_date = '' AND cum_date != '' AND cum_date <= ?) OR
          (record_date = '' AND cum_date = '' AND effective_date != '' AND effective_date <= ?)
        )
      `);
      params.push(endDate, endDate, endDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Hitung total baris yang cocok
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
        ORDER BY ${this.dateSortExpr} DESC, id DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(...params, limit, offset) as CorporateActionRecord[];

    console.error(
      "DEBUG SQL:",
      `SELECT * FROM corporate_actions ${whereClause}`,
    );
    console.error("DEBUG PARAMS:", params);

    return { data, total };
  }
}

export default new CorporateActionService();
