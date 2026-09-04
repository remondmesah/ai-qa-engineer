import { chromium, type Page } from "@playwright/test";
import type { AgentAction } from "./types.js";

export async function createBrowser() {
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false"
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  return { browser, context, page };
}

async function findTarget(page: Page, target: string) {
  const byRole = page.getByRole("button", { name: target, exact: false }).first();
  if (await byRole.count()) return byRole;

  const byLabel = page.getByLabel(target, { exact: false }).first();
  if (await byLabel.count()) return byLabel;

  const byPlaceholder = page.getByPlaceholder(target, { exact: false }).first();
  if (await byPlaceholder.count()) return byPlaceholder;

  const byText = page.getByText(target, { exact: false }).first();
  if (await byText.count()) return byText;

  return page.locator(target).first();
}

export async function executeAction(page: Page, action: AgentAction, runId: string) {
  switch (action.type) {
    case "goto":
      await page.goto(action.url, { waitUntil: "domcontentloaded", timeout: 60000 });
      break;
    case "click":
      await findTarget(page, action.target).click({ timeout: 15000 });
      break;
    case "fill":
      await findTarget(page, action.target).fill(action.value, { timeout: 15000 });
      break;
    case "select":
      await findTarget(page, action.target).selectOption(action.value, { timeout: 15000 });
      break;
    case "press":
      await findTarget(page, action.target).press(action.key, { timeout: 15000 });
      break;
    case "wait":
      await page.waitForTimeout(Math.min(action.ms, 10000));
      break;
    case "screenshot":
      await page.screenshot({ path: `evidence/${runId}-${action.name}.png`, fullPage: true });
      break;
    case "assert": {
      const locator = await findTarget(page, action.target);
      const text = await locator.innerText().catch(() => "");
      if (!text.toLowerCase().includes(action.expected.toLowerCase())) {
        throw new Error(`Assertion failed. Expected "${action.expected}", observed "${text.slice(0, 500)}"`);
      }
      break;
    }
    case "finish":
      break;
  }
}

export async function snapshot(page: Page) {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const body = await page.locator("body").innerText().catch(() => "");
  return `URL: ${url}\nTITLE: ${title}\nVISIBLE TEXT:\n${body.slice(0, 16000)}`;
}
