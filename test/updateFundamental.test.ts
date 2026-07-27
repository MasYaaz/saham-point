import { describe, test, expect, mock, beforeEach } from "bun:test";

// ==========================================================================
// 1. REGISTRASI MOCK MODULES (Wajib Berada di Paling Atas Dokumen)
// ==========================================================================

const mockScrapeProfile = mock();
mock.module("../src/scrapper/helper/scrapeProfileTradingView.ts", () => ({
  scrapeTradingViewProfile: mockScrapeProfile,
}));

const mockScrapeFundamental = mock();
mock.module("../src/scrapper/helper/scrapeFundamentalTradingView.ts", () => ({
  scrapeFundamentalTradingView: mockScrapeFundamental,
}));

const mockGet = mock();
const mockRun = mock();
const mockPrepareRun = mock();
const mockPrepare = mock(() => ({ run: mockPrepareRun }));

mock.module("../src/db/index.ts", () => ({
  default: {
    query: mock(() => ({ get: mockGet })),
    run: mockRun,
    prepare: mockPrepare,
  },
}));

// ==========================================================================
// 2. LOAD SCRIPT TARGET MENGGUNAKAN require()
//    (Cara jitu agar tidak terkena dampak ESM Hoisting)
// ==========================================================================
const {
  updateFundamental,
} = require("../src/cli/scrapper/helper/updateFundamental");

describe("updateFundamental Unit Test", () => {
  const mockContext = {}; // Sekarang 100% aman dikosongkan karena fungsi asli dilewati
  const emitenCode = "TLKM";

  beforeEach(() => {
    mockGet.mockReset();
    mockRun.mockReset();
    mockPrepareRun.mockReset();
    mockScrapeProfile.mockReset();
    mockScrapeFundamental.mockReset();
  });

  // ==========================================================================
  // TEST CASE 1: EMITEN TIDAK DITEMUKAN DI DATABASE
  // ==========================================================================
  test("Harus mengembalikan false jika emiten tidak terdaftar di database", async () => {
    mockGet.mockReturnValue(undefined);

    const result = await updateFundamental(emitenCode, mockContext);

    expect(result).toBe(false);
    expect(mockScrapeProfile).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // TEST CASE 2: SUKSES TOTAL (Data Profil & Fundamental Lengkap)
  // ==========================================================================
  test("Harus sukses mengupdate emiten & history dan mengembalikan true jika data lengkap", async () => {
    mockGet.mockReturnValue({
      id: 1,
      code: "TLKM",
      last_price: 4000,
      per: 12,
      pbv: 2,
    });

    mockScrapeProfile.mockResolvedValue({
      description: "PT Telkom Indonesia Tbk",
      market_cap: 400000000000000,
      last_dividend: 150,
      beta: 1.1,
      per: 13.5,
      eps: 300,
    });

    mockScrapeFundamental.mockResolvedValue({
      data: {
        ttm: { pbv: 2.1, roe: 18.5, der: 70.2, per: 13.2 },
        2025: {
          revenue: "45T",
          gross_profit: 20000000,
          net_profit: "10T",
          eps: 300,
        },
      },
      incompleteTabs: [],
    });

    const result = await updateFundamental(emitenCode, mockContext);

    expect(result).toBe(true);
    expect(mockRun).toHaveBeenCalled();
    expect(mockPrepareRun).toHaveBeenCalled();
  });

  // ==========================================================================
  // TEST CASE 3: DATA PARSIAL / TIDAK LENGKAP (Incomplete)
  // ==========================================================================
  test("Harus tetap menyimpan data ke DB namun mengembalikan 'INCOMPLETE' jika ada tab yang gagal", async () => {
    mockGet.mockReturnValue({ id: 1, code: "TLKM", last_price: 4000 });

    mockScrapeProfile.mockResolvedValue({
      description: "PT Telkom Indonesia Tbk",
      market_cap: 400000000000000,
      last_dividend: 0,
    });

    mockScrapeFundamental.mockResolvedValue({
      data: {
        2025: { revenue: "45T", net_profit: "10T" },
      },
      incompleteTabs: ["financials-cash-flow"],
    });

    const result = await updateFundamental(emitenCode, mockContext);

    expect(result).toBe("INCOMPLETE");
    expect(mockRun).toHaveBeenCalled();
    expect(mockPrepareRun).toHaveBeenCalled();
  });

  // ==========================================================================
  // TEST CASE 4: PROTEKSI OVERWRITE NILAI 0 / NULL
  // ==========================================================================
  test("Harus mempertahankan nilai DB lama jika scraper mengembalikan angka 0 atau null", async () => {
    mockGet.mockReturnValue({
      id: 1,
      code: "TLKM",
      last_price: 4000,
      market_cap: 350000000000000,
      per: 15,
      pbv: 2,
    });

    mockScrapeProfile.mockResolvedValue({
      description: "PT Telkom Indonesia Tbk",
      market_cap: 0,
      per: null,
    });

    mockScrapeFundamental.mockResolvedValue({
      data: {
        ttm: { pbv: 0, roe: 0 },
      },
      incompleteTabs: ["financials-statistics-and-ratios"],
    });

    await updateFundamental(emitenCode, mockContext);

    const profileUpdateArgs = mockRun.mock.calls[0];
    const bindingParamsProfile = profileUpdateArgs![1] as any[];

    expect(bindingParamsProfile[1]).toBe(350000000000000);
    expect(bindingParamsProfile[5]).toBe(15);
  });

  // ==========================================================================
  // TEST CASE 5: DATA FUNDAMENTAL (SUMMARY) BOLONG, DATA HISTORI LENGKAP
  // ==========================================================================
  test("Harus mengembalikan 'INCOMPLETE' jika data summary rasio bolong tetapi data histori tahunan lengkap", async () => {
    // DB lama punya data rasio bawaan
    mockGet.mockReturnValue({
      id: 1,
      code: "TLKM",
      last_price: 4000,
      pbv: 2,
      roe: 15,
    });

    mockScrapeProfile.mockResolvedValue({
      description: "PT Telkom Indonesia Tbk",
      market_cap: 400000000000000,
    });

    // Skenario: Tab statistik/rasio utama gagal (summarySource jadi null)
    // Tapi data laporan keuangan tahunan (FY) dari tahun-tahun sebelumnya ter-scrape dengan aman
    mockScrapeFundamental.mockResolvedValue({
      data: {
        // ttm dan current sengaja absen (summary bolong)
        2023: {
          revenue: "40T",
          cost_of_goods_sold: 2000,
          net_profit: "9T",
          eps: 250,
        },
        2024: {
          revenue: "43T",
          cost_of_goods_sold: 2100,
          net_profit: "9.5T",
          eps: 280,
        },
        2025: {
          revenue: "45T",
          cost_of_goods_sold: 2200,
          net_profit: "10T",
          eps: 300,
        },
      },
      incompleteTabs: ["financials-statistics-and-ratios"], // Menandakan ada tab yang gagal di-load
    });

    const result = await updateFundamental(emitenCode, mockContext);

    // 1. Fungsi harus tahu bahwa data ini parsial, jadi wajib me-return "INCOMPLETE"
    expect(result).toBe("INCOMPLETE");

    // 2. Data histori tahunan yang berhasil didapat harus TETAP di-upsert ke database (Integritas Data)
    expect(mockPrepareRun).toHaveBeenCalled();

    // 3. Pastikan query insert history dipanggil tepat sebanyak 3 kali (sesuai jumlah tahun: 2023, 2024, 2025)
    expect(mockPrepareRun).toHaveBeenCalledTimes(3);
  });
});
