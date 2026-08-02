export interface FullStockMetrics {
  revenue: number | null;
  interest_income: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_profit: number | null;
  eps: number | null;
  shares_outstanding: number | null;
  ebitda: number | null;
  ebit: number | null;
  roe: number | null;
  der: number | null;
  pbv: number | null;
  per: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  total_equity: number | null;
  total_debt: number | null;
  net_debt: number | null;
  cash_flow_operating: number | null;
  cash_flow_investing: number | null;
  cash_flow_financing: number | null;
  free_cash_flow: number | null;
}

export interface FullHistoryResult {
  symbol: string;
  by_quarter: Record<string, FullStockMetrics>;
  by_fy: Record<string, FullStockMetrics>;
}

// Helper ekstraksi data TradingView
function parseMetricsBySuffix(
  rawData: Record<string, any>,
  suffix: "_fq_h" | "_fy_h",
): Record<string, FullStockMetrics> {
  const periods: string[] = rawData[`fiscal_period${suffix}`] ?? [];
  const result: Record<string, FullStockMetrics> = {};

  periods.forEach((periodKey, i) => {
    const formattedKey =
      suffix === "_fy_h" && !periodKey.includes("FY")
        ? `${periodKey}-FY`
        : periodKey;

    result[formattedKey] = {
      revenue: rawData[`total_revenue${suffix}`]?.[i] ?? null,
      interest_income:
        rawData[`non_oper_interest_income${suffix}`]?.[i] ?? null,
      gross_profit: rawData[`gross_profit${suffix}`]?.[i] ?? null,
      operating_income: rawData[`oper_income${suffix}`]?.[i] ?? null,
      net_profit: rawData[`net_income${suffix}`]?.[i] ?? null,
      eps: rawData[`earnings_per_share_basic${suffix}`]?.[i] ?? null,
      shares_outstanding:
        rawData[`basic_shares_outstanding${suffix}`]?.[i] ?? null,
      ebitda: rawData[`ebitda${suffix}`]?.[i] ?? null,
      ebit: rawData[`ebit${suffix}`]?.[i] ?? null,
      roe: rawData[`return_on_equity${suffix}`]?.[i] ?? null,
      der: rawData[`debt_to_equity${suffix}`]?.[i] ?? null,
      pbv: rawData[`price_book${suffix}`]?.[i] ?? null,
      per: rawData[`price_earnings${suffix}`]?.[i] ?? null,
      total_assets: rawData[`total_assets${suffix}`]?.[i] ?? null,
      total_liabilities: rawData[`total_liabilities${suffix}`]?.[i] ?? null,
      total_equity:
        rawData[`total_equity${suffix}`]?.[i] ??
        rawData[`shrhldrs_equity${suffix}`]?.[i] ??
        null,
      total_debt: rawData[`total_debt${suffix}`]?.[i] ?? null,
      net_debt: rawData[`net_debt${suffix}`]?.[i] ?? null,
      cash_flow_operating:
        rawData[`cash_f_operating_activities${suffix}`]?.[i] ?? null,
      cash_flow_investing:
        rawData[`cash_f_investing_activities${suffix}`]?.[i] ?? null,
      cash_flow_financing:
        rawData[`cash_f_financing_activities${suffix}`]?.[i] ?? null,
      free_cash_flow: rawData[`free_cash_flow${suffix}`]?.[i] ?? null,
    };
  });

  return result;
}

// ============================================================================
// FUNGSI BUAT AMBIL DATA VIA WEBSOCKET TRADINGVIEW
// ============================================================================
export async function fetchStockHistories(
  symbol: string,
): Promise<FullHistoryResult> {
  return new Promise((resolve, reject) => {
    const formattedSymbol = symbol.replace(":", "-");
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "");
    const url = `wss://data.tradingview.com/socket.io/websocket?from=symbols%2F${formattedSymbol}%2Ffinancials-overview%2F&date=${encodeURIComponent(now)}&auth=sessionid`;

    const ws = new WebSocket(url, {
      headers: {
        Origin: "https://www.tradingview.com",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      },
    });

    const rawData: Record<string, any> = {};

    const sendTVMessage = (msg: object) => {
      const str = JSON.stringify(msg);
      ws.send(`~m~${str.length}~m~${str}`);
    };

    ws.addEventListener("open", () => {
      sendTVMessage({ m: "set_auth_token", p: ["unauthorized_user_token"] });
      const sessionId = "qs_" + Math.random().toString(36).substring(2, 12);
      sendTVMessage({ m: "quote_create_session", p: [sessionId] });

      const baseFields = [
        "fiscal_period",
        "total_revenue",
        "non_oper_interest_income",
        "gross_profit",
        "oper_income",
        "net_income",
        "earnings_per_share_basic",
        "basic_shares_outstanding",
        "ebitda",
        "ebit",
        "return_on_equity",
        "debt_to_equity",
        "price_book",
        "price_earnings",
        "total_assets",
        "total_liabilities",
        "total_equity",
        "shrhldrs_equity",
        "total_debt",
        "net_debt",
        "cash_f_operating_activities",
        "cash_f_investing_activities",
        "cash_f_financing_activities",
        "free_cash_flow",
      ];

      const requestedFields = [
        ...baseFields.map((f) => `${f}_fq_h`),
        ...baseFields.map((f) => `${f}_fy_h`),
      ];

      sendTVMessage({
        m: "quote_set_fields",
        p: [sessionId, ...requestedFields],
      });
      sendTVMessage({ m: "quote_add_symbols", p: [sessionId, symbol] });
    });

    ws.addEventListener("message", (event) => {
      const text = event.data.toString();
      if (text.includes("~h~")) {
        const match = text.match(/~h~\d+/);
        if (match) ws.send(`~m~${match[0].length}~m~${match[0]}`);
      }

      const frames = text.split(/~m~\d+~m~/).filter(Boolean);
      for (const frame of frames) {
        if (frame.startsWith("~h~")) continue;
        try {
          const json = JSON.parse(frame);
          if (json.m === "qsd" && json.p?.[1]?.v) {
            Object.assign(rawData, json.p[1].v);
          }
          if (json.m === "quote_completed") {
            ws.close();
            resolve({
              symbol,
              by_quarter: parseMetricsBySuffix(rawData, "_fq_h"),
              by_fy: parseMetricsBySuffix(rawData, "_fy_h"),
            });
          }
        } catch {}
      }
    });

    ws.addEventListener("error", (err) => {
      ws.close();
      reject(err);
    });

    setTimeout(() => {
      ws.close();
      reject(new Error("Timeout waiting for TradingView WS data"));
    }, 10000);
  });
}
