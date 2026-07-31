import BaseClient from "./baseClient";
import type { YahooChartResponse } from "../types";

/**
 * Low-level HTTP Client khusus untuk mengambil data mentah dari Yahoo Finance API.
 */
export class YahooClient extends BaseClient {
  /**
   * Fetch raw chart payload dari endpoint Yahoo Finance v8
   */
  async getChart(
    ticker: string,
    range: string,
    interval: string,
  ): Promise<YahooChartResponse | null> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`;
    return this.fetchJson<YahooChartResponse>(url);
  }
}

export const yahooClient = new YahooClient();
