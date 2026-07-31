import { getCorporateActions } from "../src/services/corporateActionService";

export async function testCorporateActions(ticker = "BBCA") {
  console.log("--------------------------------------------------");
  console.log(`3️⃣ Testing: Corporate Action Service (${ticker})`);
  console.log("--------------------------------------------------");
  const startTime = Date.now();

  try {
    const corpAction = await getCorporateActions(ticker);

    console.log(`📌 Ticker        : ${corpAction.code}`);
    console.log(`📊 Total Aksi    : ${corpAction.totalActions} Catatan`);
    console.log(`💵 Total Dividen : ${corpAction.dividends.length} Catatan`);
    console.log(`✂️ Stock Split   : ${corpAction.stockSplits.length} Catatan`);
    console.log(`📜 Rights Issue  : ${corpAction.rightsIssues.length} Catatan`);
    console.log(`🏛️ RUPS          : ${corpAction.rups.length} Catatan`);
    console.log(
      `📁 Aksi Lainnya  : ${corpAction.otherActions.length} Catatan\n`,
    );

    if (corpAction.dividends.length > 0) {
      console.log("💰 Sampel 5 Histori Dividen Terakhir:");
      console.table(
        corpAction.dividends.slice(0, 5).map((div) => ({
          Judul: div.title,
          "Tanggal Pencatatan": div.cumDate ?? "-",
          Deskripsi: div.description ?? "-",
        })),
      );
    }

    if (corpAction.otherActions.length > 0) {
      console.log("\n📁 Sampel 3 Aksi Lainnya Terakhir:");
      console.table(
        corpAction.otherActions.slice(0, 3).map((act) => ({
          Judul: act.title,
          Tanggal: act.cumDate ?? "-",
          Deskripsi: act.description ?? "-",
        })),
      );
    }
  } catch (err) {
    console.error("❌ Corporate Action Error:", err);
  } finally {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("--------------------------------------------------");
    console.log(`⏱️ Waktu Pengujian: ${duration} detik`);
    console.log("✨ Pengujian Corporate Actions Selesai.");
  }
}

if (import.meta.main || process.argv[1]?.includes("testCorporateActions")) {
  testCorporateActions();
}
