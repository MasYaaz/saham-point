import cron from "node-cron";
import { log } from "./utils/log";
import {
  syncStockData,
  syncStockPrice,
} from "./services/syncStockService/syncMarketData";
import { syncStockList } from "./services/syncStockService/syncStockList";
import { syncCorporateActions } from "./services/syncStockService/syncCorporateAction";

type NamedSyncTask = {
  name: string;
  fn: () => Promise<string>;
};

let isSyncing = false;

async function executeSync(
  tasks: NamedSyncTask | NamedSyncTask[],
  groupLabel = "Worker",
): Promise<void> {
  if (isSyncing) {
    log(
      "warn",
      `[${groupLabel}] Sinkronisasi dilewati karena proses lain masih berjalan.`,
    );
    return;
  }

  isSyncing = true;
  try {
    const taskList = Array.isArray(tasks) ? tasks : [tasks];

    for (const { name, fn } of taskList) {
      const status = await fn();
      log("info", `[${name}] ${status}`);
    }
  } catch (error) {
    log(
      "error",
      `[Sync Error] Gagal pada ${groupLabel}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    isSyncing = false;
  }
}

function startMarketWorker(): void {
  log("info", "[Worker] Scheduler bursa saham aktif (Asia/Jakarta).");

  // Initial Sync
  executeSync(
    [
      { name: "Sync Stock List", fn: syncStockList },
      { name: "Sync Market Data", fn: syncStockData },
      { name: "Sync Corporate Action Calendar", fn: syncCorporateActions },
    ],
    "Initial Startup Sync",
  );

  // Cron Job
  const task = cron.schedule(
    "*/1 9-16 * * 1-5",
    async () => {
      await executeSync(
        { name: "Cron Market Price", fn: syncStockPrice },
        "Cron Price Sync",
      );
    },
    {
      timezone: "Asia/Jakarta",
    },
  );

  const handleShutdown = (signal: string) => {
    log("info", `[Worker] Menerima sinyal ${signal}. Mematikan scheduler...`);
    task.stop();
  };

  process.once("SIGINT", () => handleShutdown("SIGINT"));
  process.once("SIGTERM", () => handleShutdown("SIGTERM"));
}

startMarketWorker();
