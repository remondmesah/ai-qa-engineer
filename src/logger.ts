import fs from "node:fs/promises";
import path from "node:path";
import type { StepLog } from "./types.js";

const file = path.resolve("evidence", "execution-log.jsonl");

export async function logEvent(event: StepLog) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(event) + "\n", "utf8");
  console.log(`[${event.time}] [${event.status}] step=${event.step} ${event.action.type} ${event.message ?? ""}`);
}
