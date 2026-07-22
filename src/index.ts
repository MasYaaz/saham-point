import app from "./endpoint";
import { initBackgroundWorker } from "./scrapper/worker";
import { PORT } from "./config";

// Inisialisasi worker di background
initBackgroundWorker();

console.log(`🚀 Saham Point Core Server running on port ${PORT}`);

// Export standar untuk Bun Runtime
export default {
  port: Number(PORT),
  fetch: app.fetch,
  development: false,
};
