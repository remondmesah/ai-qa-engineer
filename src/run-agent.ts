import "dotenv/config";
import crypto from "node:crypto";
import { createBrowser, executeAction, snapshot } from "./browser.js";
import { nextAction, planTestPoints, analyzeFailure } from "./ai.js";
import { logEvent } from "./logger.js";
import { appendResult } from "./sheets.js";
import type { TestPoint } from "./types.js";

const task = process.env.TEST_PROMPT ||
  process.argv.slice(2).join(" ") ||
  "Lakukan testing terhadap fitur Pindah Meja secara menyeluruh.";

const maxSteps = Number(process.env.MAX_STEPS || 40);
const runId = `RUN-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomBytes(2).toString("hex")}`;

if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required.");

console.log(`\nAI QA ENGINEER — ${runId}`);
console.log(`TASK: ${task}\n`);

const testPoints: TestPoint[] = await planTestPoints(task);
console.log(`AI generated ${testPoints.length} initial test points.`);

const { browser, page } = await createBrowser();

try {
  for (const [index, tp] of testPoints.entries()) {
    console.log(`\n=== ${tp.id || `TP-${index + 1}`} — ${tp.title} ===`);
    let history = "";
    let status: "PASS" | "FAIL" | "BLOCKED" = "BLOCKED";
    let summary = "Execution ended without a final result.";
    let screenshot = "";

    for (let step = 1; step <= maxSteps; step++) {
      const snap = await snapshot(page);
      const action = await nextAction({ task, testPoint: tp, snapshot: snap, history });

      const started = { runId, time: new Date().toISOString(), step, action, status: "STARTED" as const };
      await logEvent(started);

      if (action.type === "finish") {
        status = action.status;
        summary = action.summary;
        break;
      }

      try {
        await executeAction(page, action, runId);
        const message = action.reason || "Action completed.";
        await logEvent({
          runId, time: new Date().toISOString(), step, action,
          status: "PASS", message, screenshot
        });
        history += `STEP ${step}: ${JSON.stringify(action)} => PASS\n`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        screenshot = `evidence/${runId}-failure-step-${step}.png`;
        await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
        await logEvent({
          runId, time: new Date().toISOString(), step, action,
          status: "FAIL", message, screenshot
        });
        history += `STEP ${step}: ${JSON.stringify(action)} => FAIL: ${message}\n`;
        // Give the AI the failure and let it adapt on the next loop.
      }
    }

    const actual = summary;
    let aiAnalysis = "";
    if (status === "FAIL") {
      aiAnalysis = await analyzeFailure({
        testPoint: tp,
        expected: tp.expected,
        actual
      });
    }

    await appendResult([
      new Date().toISOString(),
      runId,
      tp.id,
      tp.title,
      tp.objective,
      tp.expected,
      actual,
      status,
      aiAnalysis,
      screenshot,
      task
    ]);

    console.log(`RESULT: ${status} — ${summary}`);
  }
} finally {
  await browser.close();
  console.log(`\nExecution finished: ${runId}`);
}
