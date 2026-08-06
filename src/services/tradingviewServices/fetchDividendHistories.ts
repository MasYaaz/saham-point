// ============================================================================
// INTERFACES DATA DIVIDEN PER EVENT
// ============================================================================

export interface DividendEventRecord {
  symbol: string;
  year: number; // Tahun dari Ex-Date / Payment Date
  cash_dividend: number; // Nominal DPS (Rupiah per lembar)
  ex_date: string; // ISO String 'YYYY-MM-DD'
  record_date: string; // ISO String 'YYYY-MM-DD'
  payment_date: string; // ISO String 'YYYY-MM-DD'
  type: string; // e.g., 'INTERIM', 'FINAL', 'SPECIAL', 'SEMI-ANNUAL'
}

export interface DividendFetchResult {
  symbol: string;
  total_events: number;
  data: DividendEventRecord[]; // Array per event pembagian dividen
}

// ============================================================================
// HELPER PARSER
// ============================================================================

/**
 * Konversi Epoch Timestamp (detik) dari TradingView ke ISO Date 'YYYY-MM-DD'
 */
function parseTvDate(timestampSec: number | null | undefined): {
  dateStr: string;
  year: number;
} {
  if (!timestampSec) return { dateStr: "", year: new Date().getFullYear() };
  const d = new Date(timestampSec * 1000);
  if (isNaN(d.getTime()))
    return { dateStr: "", year: new Date().getFullYear() };

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");

  return {
    dateStr: `${year}-${month}-${day}`,
    year,
  };
}

/**
 * Ekstraksi array _h dari TradingView menjadi array of object per event dividen
 */
function parseDividendEvents(
  symbol: string,
  rawData: Record<string, any>,
): DividendEventRecord[] {
  const amounts: number[] = rawData["dividend_amount_h"] ?? [];
  const exDates: number[] = rawData["dividend_ex_date_h"] ?? [];
  const recordDates: number[] = rawData["dividend_record_date_h"] ?? [];
  const paymentDates: number[] = rawData["dividend_payment_date_h"] ?? [];
  const rawTypes: string[] = rawData["dividend_type_h"] ?? [];

  const events: DividendEventRecord[] = [];

  for (let i = 0; i < amounts.length; i++) {
    const amount = amounts[i];
    if (amount === undefined || amount === null) continue;

    const exParsed = parseTvDate(exDates[i]);
    const recParsed = parseTvDate(recordDates[i]);
    const payParsed = parseTvDate(paymentDates[i]);

    // Tentukan tahun berdasarkan Ex-Date, jika kosong gunakan Record/Payment Date
    const eventYear = exParsed.year || recParsed.year || payParsed.year;

    // Standarisasi tipe dividen (INTERIM, FINAL, SPECIAL, dll)
    const rawType = (rawTypes[i] ?? "FINAL").toUpperCase();
    let type = "FINAL";
    if (rawType.includes("INTERIM")) type = "INTERIM";
    else if (rawType.includes("SPECIAL")) type = "SPECIAL";
    else if (rawType.includes("SEMI")) type = "INTERIM";

    events.push({
      symbol,
      year: eventYear,
      cash_dividend: amount,
      ex_date: exParsed.dateStr,
      record_date: recParsed.dateStr,
      payment_date: payParsed.dateStr,
      type,
    });
  }

  // Urutkan dari tanggal dividen paling baru ke paling lama
  return events.sort((a, b) => b.ex_date.localeCompare(a.ex_date));
}

// ============================================================================
// FUNGSI WEBSOCKET FETCH DIVIDEND HISTORIES
// ============================================================================

export async function fetchDividendHistories(
  symbol: string,
): Promise<DividendFetchResult> {
  return new Promise((resolve, reject) => {
    const formattedSymbol = symbol.replace(":", "-");
    const now = new Date().toISOString().replace(/\.\d{3}Z$/, "");
    const url = `wss://data.tradingview.com/socket.io/websocket?from=symbols%2F${formattedSymbol}%2Ffinancials-dividends%2F&date=${encodeURIComponent(now)}&auth=sessionid`;

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

      // Field event dividen TradingView
      const requestedFields = [
        "dividend_amount_h",
        "dividend_ex_date_h",
        "dividend_record_date_h",
        "dividend_payment_date_h",
        "dividend_type_h",
      ];

      sendTVMessage({
        m: "quote_set_fields",
        p: [sessionId, ...requestedFields],
      });
      sendTVMessage({ m: "quote_add_symbols", p: [sessionId, symbol] });
    });

    ws.addEventListener("message", (event) => {
      const text = event.data.toString();

      // Handshake / Heartbeat
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
            const events = parseDividendEvents(symbol, rawData);
            resolve({
              symbol,
              total_events: events.length,
              data: events,
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
      reject(new Error("Timeout waiting for TradingView Dividend WS data"));
    }, 10000);
  });
}
