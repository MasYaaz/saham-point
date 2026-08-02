import {
  stockbitClient,
  type StockbitClient,
} from "../../client/stockbitClient";

/* ============================================================================
 * TYPES & INTERFACES (Compact Version)
 * ============================================================================ */

export interface CompactBrokerDetail {
  brokerCode: string;
  volume: number; // Volume transaksi (lot/lembar)
  value: number; // Value transaksi (Rp)
  avgPrice: number;
}

export interface BandarDetectorSummary {
  accdistStatus: string;
  top1Percent: number;
  top3Percent: number;
  top5Percent: number;
  totalBuyer: number;
  totalSeller: number;
}

export interface BroxsumResponse {
  ticker: string;
  fromDate: string;
  toDate: string;
  netBuyBrokers: CompactBrokerDetail[];
  netSellBrokers: CompactBrokerDetail[];
  topAccumulationRatio: { top1: number; top3: number; top5: number };
  bandarDetector?: BandarDetectorSummary;
}

export interface FetchBroxsumInput {
  ticker: string;
  fromDate: string;
  toDate: string;
  limit?: number; // Opsional: default top 10
}

/* ============================================================================
 * SERVICE IMPLEMENTATION
 * ============================================================================ */

export class StockbitBroxsumService {
  constructor(private client: StockbitClient = stockbitClient) {}

  async getBroxsum(input: FetchBroxsumInput): Promise<BroxsumResponse> {
    const ticker = input.ticker.trim().toUpperCase();
    const { fromDate, toDate, limit = 10 } = input;

    if (!ticker) throw new Error("Kode ticker saham tidak boleh kosong.");

    const rawResponse = await this.client.get(`/marketdetectors/${ticker}`, {
      from: fromDate,
      to: toDate,
      transaction_type: "TRANSACTION_TYPE_NET",
      market_board: "MARKET_BOARD_REGULER",
      investor_type: "INVESTOR_TYPE_ALL",
      limit: 25,
    });

    const { broker_summary: summary = {}, bandar_detector: detector = {} } =
      rawResponse?.data || {};

    // Helper mapper yang jauh lebih ringkas
    const mapBroker = (list: any[], isSell = false): CompactBrokerDetail[] =>
      (list || []).slice(0, limit).map((item) => ({
        brokerCode: String(
          item.netbs_broker_code || item.broker_code || "",
        ).toUpperCase(),
        volume: Math.abs(
          Number(isSell ? item.slot || item.svol : item.blot || item.bvol) || 0,
        ),
        value: Math.abs(Number(isSell ? item.sval : item.bval) || 0),
        avgPrice: Math.round(
          Number(
            isSell
              ? item.netbs_sell_avg_price || item.savg
              : item.netbs_buy_avg_price || item.bavg,
          ) || 0,
        ),
      }));

    const netBuyBrokers = mapBroker(summary.brokers_buy, false);
    const netSellBrokers = mapBroker(summary.brokers_sell, true);

    const totalBuyValue = netBuyBrokers.reduce((acc, b) => acc + b.value, 0);

    const getRatio = (key: "top1" | "top3" | "top5", count: number) => {
      if (detector[key]?.percent) return Number(detector[key].percent);
      if (totalBuyValue <= 0) return 0;
      const sum = netBuyBrokers
        .slice(0, count)
        .reduce((acc, b) => acc + b.value, 0);
      return Number(((sum / totalBuyValue) * 100).toFixed(2));
    };

    const top1Percent = getRatio("top1", 1);
    const top3Percent = getRatio("top3", 3);
    const top5Percent = getRatio("top5", 5);

    return {
      ticker,
      fromDate,
      toDate,
      netBuyBrokers,
      netSellBrokers,
      topAccumulationRatio: {
        top1: top1Percent,
        top3: top3Percent,
        top5: top5Percent,
      },
      bandarDetector: {
        accdistStatus: detector.broker_accdist || "-",
        top1Percent,
        top3Percent,
        top5Percent,
        totalBuyer: Number(detector.total_buyer) || 0,
        totalSeller: Number(detector.total_seller) || 0,
      },
    };
  }
}

export const stockbitBroxsumService = new StockbitBroxsumService();
export const getBroxsum = (input: FetchBroxsumInput) =>
  stockbitBroxsumService.getBroxsum(input);
