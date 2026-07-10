import { initBackgroundWorker } from "./scrapper/worker";
import { handleCommand } from "./cli/command";
import app from "./server";
import { PORT } from "./config"; // Menggunakan konfigurasi terpusat
import { readlineHead } from "./cli/component/readlineInterface";
import {
  acceptSuggestion,
  clearSuggestion,
  renderGhostSuggestion,
} from "./cli/helper/autoCompletion";
import { TUIHead } from "./cli/component/TUIHead";

initBackgroundWorker();

setTimeout(() => {
  TUIHead();
  readlineHead.prompt();
}, 50);

process.stdin.on("keypress", (str, key) => {
  if (key.name === "right" || key.name === "tab") {
    if (acceptSuggestion()) return;
  }
  renderGhostSuggestion();
});

// Handler utama saat tombol Enter ditekan
readlineHead.on("line", async (line) => {
  clearSuggestion();
  await handleCommand(line, TUIHead);
});

readlineHead.on("SIGINT", () => {
  console.log("\n👋 Mematikan core engine Saham Point...");
  process.exit(0);
});

export default {
  port: Number(PORT),
  fetch: app.fetch,
  development: false,
};
