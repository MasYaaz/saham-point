import IdxClient from "../../client/idxClient";

// ============================================================================
// TYPES & INTERFACES (Sesuai Kategori Lengkap IDX)
// ============================================================================

export type ActionType =
  | "DIVIDEND"
  | "STOCK_SPLIT"
  | "REVERSE_STOCK"
  | "RIGHTS_ISSUE"
  | "TANPA_HMETD"
  | "ESOP_MSOP"
  | "BONUS"
  | "IPO"
  | "LISTING"
  | "DELISTING"
  | "WARRANT"
  | "MERGER"
  | "CAPITAL_REDUCTION"
  | "CONVERSION"
  | "BUYBACK"
  | "PRIVATE_PLACEMENT"
  | "RUPS"
  | "OTHER";

interface CorporateActionItem {
  code: string;
  actionType: ActionType;
  title: string;
  cumDate?: string;
  exDate?: string;
  recordingDate?: string;
  paymentDate?: string;
  amountOrRatio?: string;
  description?: string;
}

interface CorporateActionResponse {
  code: string;
  totalActions: number;
  dividends: CorporateActionItem[];
  stockSplits: CorporateActionItem[];
  rightsIssues: CorporateActionItem[];
  esopMsop: CorporateActionItem[];
  bonuses: CorporateActionItem[];
  warrants: CorporateActionItem[];
  buybacks: CorporateActionItem[];
  privatePlacements: CorporateActionItem[];
  rups: CorporateActionItem[];
  otherActions: CorporateActionItem[];
}

// Payload asli dari BEI ListingActivity/GetIssuedHistory
interface IdxIssuedHistoryItem {
  id: number;
  KodeEmiten: string;
  TanggalPencatatan: string; // ISO Date: "2026-07-30T00:00:00"
  JenisTindakan: string; // e.g. "waran", "Dividen Saham", "tanpaHmetd", dll.
  JumlahSaham: number;
  JumlahSahamSetelahTindakan: number;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

export class CorporateActionService extends IdxClient {
  /**
   * Mengambil riwayat tindakan korporasi (Corporate Actions) emiten secara lengkap dari BEI.
   */
  async getCorporateActions(code: string): Promise<CorporateActionResponse> {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) throw new Error("Kode ticker saham tidak boleh kosong.");

    // Fetch bulk data langsung melalui BaseClient (Native Fetch)
    const url = `https://www.idx.co.id/primary/ListingActivity/GetIssuedHistory?caType=&dateFrom=&dateTo=&start=0&length=9999`;
    const json = await this.fetchJson<{ data?: IdxIssuedHistoryItem[] }>(url);
    const rawDataList = json?.data || [];

    // Filter in-memory berdasarkan KodeEmiten
    const filteredData = rawDataList.filter(
      (item) => (item.KodeEmiten || "").toUpperCase() === cleanCode,
    );

    const dividends: CorporateActionItem[] = [];
    const stockSplits: CorporateActionItem[] = [];
    const rightsIssues: CorporateActionItem[] = [];
    const esopMsop: CorporateActionItem[] = [];
    const bonuses: CorporateActionItem[] = [];
    const warrants: CorporateActionItem[] = [];
    const buybacks: CorporateActionItem[] = [];
    const privatePlacements: CorporateActionItem[] = [];
    const rups: CorporateActionItem[] = [];
    const otherActions: CorporateActionItem[] = [];

    for (const item of filteredData) {
      // Normalisasi teks untuk mengabaikan spasi, huruf besar/kecil, dan simbol strip/underscore
      const rawJenis = (item.JenisTindakan || "")
        .toLowerCase()
        .replace(/[\s_-]/g, "");

      // Ambil format tanggal YYYY-MM-DD dari TanggalPencatatan
      const [listingDate = ""] = (item.TanggalPencatatan || "").split("T");

      // Format rincian jumlah saham untuk deskripsi/title
      const sharesAdded = item.JumlahSaham
        ? item.JumlahSaham.toLocaleString("id-ID")
        : "0";
      const sharesTotal = item.JumlahSahamSetelahTindakan
        ? item.JumlahSahamSetelahTindakan.toLocaleString("id-ID")
        : "0";

      const actionItem: CorporateActionItem = {
        code: cleanCode,
        actionType: "OTHER",
        title: `${item.JenisTindakan} - ${sharesAdded} lembar`,
        cumDate: listingDate || undefined,
        description: `Jumlah saham setelah tindakan: ${sharesTotal} lembar`,
      };

      // Comprehensive Categorization Mapping Berdasarkan Format Normalisasi IDX
      if (rawJenis.includes("dividen")) {
        actionItem.actionType = "DIVIDEND";
        dividends.push(actionItem);
      } else if (rawJenis.includes("reversestock")) {
        actionItem.actionType = "REVERSE_STOCK";
        stockSplits.push(actionItem);
      } else if (rawJenis.includes("stocksplit")) {
        actionItem.actionType = "STOCK_SPLIT";
        stockSplits.push(actionItem);
      } else if (rawJenis.includes("tanpahmetd")) {
        actionItem.actionType = "TANPA_HMETD";
        rightsIssues.push(actionItem);
      } else if (rawJenis.includes("hmetd") || rawJenis.includes("right")) {
        actionItem.actionType = "RIGHTS_ISSUE";
        rightsIssues.push(actionItem);
      } else if (rawJenis.includes("esop") || rawJenis.includes("msop")) {
        actionItem.actionType = "ESOP_MSOP";
        esopMsop.push(actionItem);
      } else if (rawJenis.includes("bonus")) {
        actionItem.actionType = "BONUS";
        bonuses.push(actionItem);
      } else if (rawJenis.includes("waran")) {
        actionItem.actionType = "WARRANT";
        warrants.push(actionItem);
      } else if (rawJenis.includes("BuybackSaham")) {
        actionItem.actionType = "BUYBACK";
        buybacks.push(actionItem);
      } else if (
        rawJenis.includes("privateplacement") ||
        rawJenis.includes("pmthmetd")
      ) {
        actionItem.actionType = "PRIVATE_PLACEMENT";
        privatePlacements.push(actionItem);
      } else if (rawJenis.includes("rups")) {
        actionItem.actionType = "RUPS";
        rups.push(actionItem);
      } else if (rawJenis.includes("ipo")) {
        actionItem.actionType = "IPO";
        otherActions.push(actionItem);
      } else if (
        rawJenis.includes("companylisting") ||
        rawJenis.includes("listing")
      ) {
        actionItem.actionType = "LISTING";
        otherActions.push(actionItem);
      } else if (rawJenis.includes("delist")) {
        actionItem.actionType = "DELISTING";
        otherActions.push(actionItem);
      } else if (
        rawJenis.includes("gabungusaha") ||
        rawJenis.includes("merger")
      ) {
        actionItem.actionType = "MERGER";
        otherActions.push(actionItem);
      } else if (
        rawJenis.includes("kurangmodal") ||
        rawJenis.includes("capitalreduction")
      ) {
        actionItem.actionType = "CAPITAL_REDUCTION";
        otherActions.push(actionItem);
      } else if (
        rawJenis.includes("konversi") ||
        rawJenis.includes("obligasiwajibkonversi")
      ) {
        actionItem.actionType = "CONVERSION";
        otherActions.push(actionItem);
      } else {
        otherActions.push(actionItem);
      }
    }

    return {
      code: cleanCode,
      totalActions: filteredData.length,
      dividends,
      stockSplits,
      rightsIssues,
      esopMsop,
      bonuses,
      warrants,
      buybacks,
      privatePlacements,
      rups,
      otherActions,
    };
  }
}

// Export singleton instance / function helper agar mudah dipanggil di MCP tool handler
const corporateActionService = new CorporateActionService();

export async function getCorporateActions(
  code: string,
): Promise<CorporateActionResponse> {
  return corporateActionService.getCorporateActions(code);
}
