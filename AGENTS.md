# AGENTS.md

Panduan ini adalah guardrail untuk AI agent yang bekerja di repo Saham Point.

## Source of Truth

- Baca `docs/ARCHITECTURE.md` sebelum mengubah struktur, worker, database, atau integrasi eksternal.
- Baca `docs/API_OR_CONTRACTS.md` sebelum mengubah MCP tool, service contract, schema input, atau format output.
- Jika kode berubah dan memengaruhi arsitektur/kontrak, update dokumen terkait pada perubahan yang sama.

## Tech Stack Baku

- Runtime: Bun.
- Bahasa: TypeScript ESM.
- MCP: `@modelcontextprotocol/sdk` dengan stdio transport.
- Database: SQLite via `bun:sqlite`.
- Scheduler: `node-cron`.
- External IO: native `fetch`, native `WebSocket`, dan `Bun.spawn` hanya pada modul yang memang sudah menggunakannya.
- Technical indicator: `technicalindicators`.
- News parsing: `rss-parser` dan `@extractus/article-extractor`.

Jangan menambah dependency baru jika standard library, Bun API, atau dependency yang sudah ada cukup.

## Aturan Izin Eksekusi

- Jangan menjalankan terminal tanpa konfirmasi eksplisit dari user.
- Perintah baca seperti `rg`, `find`, `sed`, `ls`, dan `git diff` tetap butuh izin jika user belum mengizinkan terminal pada turn tersebut.
- Jangan menjalankan `bun run start`, `bun run dev`, worker, script test, build, atau command yang memanggil API eksternal tanpa persetujuan eksplisit.
- Jangan menjalankan command mutatif/destruktif tanpa persetujuan eksplisit. Contoh: `rm`, `git reset`, `git checkout --`, `bun run build:tar`, migrasi manual DB, atau cleanup log/data.
- Perhatikan bahwa `bun run build:tar` menghapus `dist` dan `saham-point.tar.gz` sebelum build.
- Perhatikan bahwa refresh token Stockbit dapat menulis token baru ke `.env`.

## Struktur Kode

- `src/mcp/*.ts` hanya untuk kontrak MCP: nama tool, schema input Zod, delegasi ke service, dan formatting response.
- `src/services/*` untuk business logic, query DB, sinkronisasi, screener, analyzer, dan integrasi level service.
- `src/client/*` untuk HTTP client low-level dan session/header handling.
- `src/db/index.ts` untuk schema dan koneksi SQLite. Jangan ubah schema tanpa mengecek semua query service dan dokumen kontrak.
- `src/utils/*` untuk helper kecil yang reusable. Jangan membuat helper baru jika fungsi hanya dipakai sekali dan bisa dibaca langsung.
- `src/types.ts` untuk type bersama yang benar-benar lintas modul.

## Konvensi Type-Safety

- Pertahankan TypeScript strict mode.
- Pakai Zod untuk input MCP tool.
- Normalisasi ticker ke uppercase di boundary tool/service.
- Untuk tanggal publik gunakan format `YYYY-MM-DD`; untuk IDX compact gunakan `YYYYMMDD` hanya di layer service yang memanggil endpoint IDX.
- Jangan memakai `any` baru kecuali data eksternal memang belum stabil; jika dipakai, segera map ke shape internal yang eksplisit.
- Output MCP sebaiknya JSON string dengan field stabil: `status`, filter/input yang dipakai, `count`/`total`, dan `data`.

## Batasan Modifikasi

- Jangan ubah `src/mcp.ts`, `src/worker.ts`, `src/db/index.ts`, atau schema tabel tanpa alasan kuat dan update docs.
- Jangan mengubah path database `data/saham.db` atau strategi lazy initialization tanpa mengecek worker dan semua service.
- Jangan mengubah nama MCP tool yang sudah ada tanpa rencana kompatibilitas.
- Jangan mengubah format output tool publik tanpa update `docs/API_OR_CONTRACTS.md`.
- Jangan memasukkan token, cookie, bearer token, atau isi `.env` ke commit/dokumen.
- Jangan mengubah file di `data/`, `logs/`, `dist/`, atau arsip build kecuali user meminta.

## Prinsip Perubahan

- Pilih perubahan terkecil yang menyelesaikan masalah.
- Reuse pola lokal sebelum membuat abstraksi baru.
- Query DB harus memakai parameter binding, bukan string interpolation untuk input user.
- Untuk integrasi eksternal, pertahankan retry/session/rate-limit delay yang sudah ada kecuali ada alasan operasional jelas.
- Untuk sync yang berjalan lama, pertahankan kemampuan pause/status dan hindari overlap proses.
