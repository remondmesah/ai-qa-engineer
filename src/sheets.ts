import { google } from "googleapis";

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

export async function appendResult(values: string[]) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const auth = getAuth();
  if (!spreadsheetId || !auth) {
    console.log("Google Sheets not configured; keeping execution log locally.");
    return;
  }

  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "TEST_RESULTS!A:K",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] }
  });
}
