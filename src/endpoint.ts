import { Hono } from "hono";
import { sahamRouter } from "./routes/saham.router";
import { screenerRouter } from "./routes/screener.router";
import { technicalRouter } from "./routes/technical.router";
import { sektorRouter } from "./routes/sektor.router";
import { metaRouter } from "./routes/meta.router";

const app = new Hono();

// Redirect Root
app.get("/", (c) => c.redirect("/api"));

// Mounting Sub-Routers
app.route("/api/saham", sahamRouter);
app.route("/api/screener", screenerRouter);
app.route("/api/technical", technicalRouter);
app.route("/api/sektor", sektorRouter);
app.route("/api", metaRouter);

export default app;
