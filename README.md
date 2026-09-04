# AI QA Engineer V1

## Tujuan

High-level prompt -> AI membuat test point -> AI mengarahkan browser -> Playwright menjalankan -> hasil/evidence dicatat -> Google Sheet di-update.

Google Sheet adalah **output/audit trail**, bukan sumber test case utama.

## Arsitektur

Google Sheet/report
        ^
        |
AI QA Engine -> Playwright -> Chromium (GitHub Actions cloud runner) -> staging web app

## Status V1

POC ini sengaja memisahkan:
1. Test-point planner
2. Browser executor
3. Validator/analysis
4. Reporter

## Setup lokal

```bash
npm install
npx playwright install chromium
copy .env.example .env
```

Isi `OPENAI_API_KEY`.

Contoh:
```bash
npm run test:ai -- "Lakukan testing terhadap fitur Pindah Meja secara menyeluruh."
```

## Google Sheet

Buat spreadsheet dengan sheet bernama `TEST_RESULTS`.

Header yang disarankan:

Timestamp | Run ID | Test Point ID | Test Point | Objective | Expected | Actual/Summary | Status | AI Analysis | Evidence | Task

Service account harus memiliki akses Editor ke spreadsheet.

Set secret:
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

## GitHub Actions

Repository -> Settings -> Secrets and variables -> Actions.

Buat:
- OPENAI_API_KEY
- QA_USERNAME
- QA_PASSWORD
- GOOGLE_SHEET_ID
- GOOGLE_SERVICE_ACCOUNT_JSON

Lalu:
Actions -> AI QA Engineer -> Run workflow -> isi prompt.

## Penting

- Jangan commit `.env`, password, service-account JSON, atau API key.
- Jangan gunakan credential production.
- Evidence dapat mengandung data sensitif; simpan sebagai artifact privat dan gunakan retention pendek.
- V1 belum melakukan transaksi nyata, belum melakukan destructive action, dan belum mempunyai approval gate otomatis.

## Pengembangan berikutnya

V1.1: login-aware actions + structured DOM/ARIA snapshot.
V1.2: live event dashboard.
V1.3: parallel reporter queue untuk Google Sheets.
V1.4: self-healing locator.
V1.5: test coverage memory dan regression selection.
