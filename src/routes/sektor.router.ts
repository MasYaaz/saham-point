import { Hono } from "hono";
import db from "../db";
import type { EmitenDbRow } from "../types";

export const sektorRouter = new Hono();

// GET /api/sektor/:name
sektorRouter.get("/:name", (c) => {
  const sectorName = c.req.param("name");
  const result = db
    .query(
      `SELECT code, name, sector, last_price, pbv, per, roe, der, market_cap
       FROM emiten WHERE sector LIKE ? ORDER BY market_cap DESC`,
    )
    .all(`%${sectorName}%`) as EmitenDbRow[];

  return c.json({ success: true, count: result.length, data: result });
});
