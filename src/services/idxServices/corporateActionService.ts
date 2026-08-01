// ============================================================================
// TYPES & INTERFACES (Sesuai JSON Asli IDX)
// ============================================================================

import IdxClient from "../../client/idxClient";

export interface CorporateActionItem {
  code: string;
  actionType:
    "DIVIDEND" | "STOCK_SPLIT" | "RIGHTS_ISSUE" | "RUPS" | "BONUS" | "OTHER";
  title: string;
  cumDate?: string;
  exDate?: string;
  recordingDate?: string;
  paymentDate?: string;
  amountOrRatio?: string;
  description?: string;
}

export interface CorporateActionResponse {
  code: string;
  totalActions: number;
  dividends: CorporateActionItem[];
  stockSplits: CorporateActionItem[];
  rightsIssues: CorporateActionItem[];
  rups: CorporateActionItem[];
  otherActions: CorporateActionItem[];
}

// Payload asli dari BEI ListingActivity/GetIssuedHistory
interface IdxIssuedHistoryItem {
  id: number;
  KodeEmiten: string;
  TanggalPencatatan: string; // ISO Date: "2026-07-30T00:00:00"
  JenisTindakan: string; // e.g. "waran", "Dividen Saham", "hmetd", "delist"
  JumlahSaham: number;
  JumlahSahamSetelahTindakan: number;
}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

export class CorporateActionService extends IdxClient {
  /**
   * Mengambil riwayat tindakan korporasi (Corporate Actions) emiten dari BEI.
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
    const rups: CorporateActionItem[] = [];
    const otherActions: CorporateActionItem[] = [];

    for (const item of filteredData) {
      const jenisTindakan = (item.JenisTindakan || "").toLowerCase();

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

      // Categorization mapping
      if (jenisTindakan.includes("dividen")) {
        actionItem.actionType = "DIVIDEND";
        dividends.push(actionItem);
      } else if (
        jenisTindakan.includes("split") ||
        jenisTindakan.includes("reverse")
      ) {
        actionItem.actionType = "STOCK_SPLIT";
        stockSplits.push(actionItem);
      } else if (
        jenisTindakan.includes("hmetd") ||
        jenisTindakan.includes("right")
      ) {
        actionItem.actionType = "RIGHTS_ISSUE";
        rightsIssues.push(actionItem);
      } else if (jenisTindakan.includes("rups")) {
        actionItem.actionType = "RUPS";
        rups.push(actionItem);
      } else if (jenisTindakan.includes("bonus")) {
        actionItem.actionType = "BONUS";
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
