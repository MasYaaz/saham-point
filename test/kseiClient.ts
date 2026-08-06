import kseiClient from "../src/client/kseiClient";
import db from "../src/db";

async function testSingleDaySync(targetDate = "2016-09-01") {
  console.log("==================================================");
  console.log(`🚀 TEST SINKRONISASI 1 HARI (${targetDate})`);
  console.log("==================================================");

  const globalStart = performance.now();

  // 1. Cek Kondisi DB Sebelum
  const countBefore = (
    db.query("SELECT COUNT(*) as count FROM corporate_actions").get() as {
      count: number;
    }
  ).count;
  console.log(`[1/3] 📊 Data DB Sebelum : ${countBefore} baris`);

  // 2. Fetch Data KSEI (1 Hari)
  console.log(`[2/3] 📡 Fetching data tanggal ${targetDate}...`);
  const fetchStart = performance.now();
  const items = await kseiClient.fetchByDate(targetDate);
  const fetchDuration = ((performance.now() - fetchStart) / 1000).toFixed(2);

  console.log(
    `      -> Ditemukan: ${items.length} item (${fetchDuration} detik)`,
  );

  // 3. Simpan ke Database
  let insertedCount = 0;
  if (items.length > 0) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO corporate_actions (
        security_code, security_name, display_name, type_of_ca,
        cum_date, record_date, effective_date, start_date, end_date, distribution_date,
        description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const runTransaction = db.transaction((dataList) => {
      let count = 0;
      for (const item of dataList) {
        const res = stmt.run(
          item.security_code || "",
          item.security_name || "",
          item.display_name || "",
          item.type_of_ca || "",
          item.cum_date || "",
          item.record_date || "",
          item.effective_date || "",
          item.start_date || "",
          item.end_date || "",
          item.distribution_date || "",
          item.description || "",
        );
        if (res.changes > 0) count++;
      }
      return count;
    });

    insertedCount = runTransaction(items);
  }

  // 4. Cek Kondisi DB Setelah
  const countAfter = (
    db.query("SELECT COUNT(*) as count FROM corporate_actions").get() as {
      count: number;
    }
  ).count;

  const totalDuration = ((performance.now() - globalStart) / 1000).toFixed(2);

  console.log(`[3/3] ✅ EKSKUSI SELESAI`);
  console.log("--------------------------------------------------");
  console.log(`📌 Tanggal Uji   : ${targetDate}`);
  console.log(`📌 Data Ditarik  : ${items.length} item`);
  console.log(`📌 Data Disimpan : +${insertedCount} baris baru`);
  console.log(`📌 Total DB      : ${countAfter} baris`);
  console.log(`⏱️  Total Durasi  : ${totalDuration} detik`);
  console.log("==================================================");
}

testSingleDaySync();
