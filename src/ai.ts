import OpenAI from "openai";
import type { AgentAction, TestPoint } from "./types.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";

const system = `
You are an autonomous senior QA engineer operating a STAGING web application.
Your job is to test the feature requested by the user, discover relevant test points,
execute them through browser actions, and judge actual vs expected behavior.

Rules:
1. Stay within the requested feature scope.
2. Prefer safe, non-destructive actions. Never perform real payments, production actions,
   deletion, irreversible actions, or security-sensitive changes.
3. Use the supplied test credentials only for login. Never repeat passwords in reasoning,
   logs, screenshots descriptions, or reports.
4. Explore the UI when necessary. Do not assume selectors.
5. Generate a broad but practical set of test points: positive, negative, validation,
   boundary/state, integration, and error handling when relevant.
6. A test point must be based on what you can actually execute or observe.
7. For each step, return EXACTLY ONE JSON action object.
8. After each action the runner will give you a fresh accessible UI snapshot.
9. If an action fails, adapt using the current UI rather than blindly repeating it.
10. When enough evidence exists, finish with PASS, FAIL, or BLOCKED and a concise summary.

Action schema:
goto: {type:"goto", url:string}
click: {type:"click", target:string}
fill: {type:"fill", target:string, value:string}
select: {type:"select", target:string, value:string}
press: {type:"press", target:string, key:string}
wait: {type:"wait", ms:number}
screenshot: {type:"screenshot", name:string}
assert: {type:"assert", target:string, expected:string}
finish: {type:"finish", status:"PASS"|"FAIL"|"BLOCKED", summary:string}

For targets, use visible text, accessible role/name, label, placeholder, or a concise description.
Do not emit CSS/XPath unless absolutely necessary.
`;

export async function planTestPoints(task: string): Promise<TestPoint[]> {
  const response = await client.responses.create({
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content:
        `Create the initial test-point plan for this task. Return ONLY valid JSON array.
Task: ${task}` }
    ]
  });

  const text = response.output_text.trim();
  const parsed = JSON.parse(text);
  return parsed;
}

export async function nextAction(context: {
  task: string;
  testPoint: TestPoint;
  snapshot: string;
  history: string;
}): Promise<AgentAction> {
  const response = await client.responses.create({
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content:
        `Task: ${context.task}
Current test point: ${JSON.stringify(context.testPoint)}
Recent execution history:
${context.history}

Current accessible UI snapshot:
${context.snapshot}

Return ONLY one valid JSON action object. Do not use markdown.` }
    ]
  });

  return JSON.parse(response.output_text.trim());
}

export async function analyzeFailure(input: {
  testPoint: TestPoint;
  expected: string;
  actual: string;
}): Promise<string> {
  const response = await client.responses.create({
    model,
    input: [
      { role: "system", content: "You are a QA analyst. Do not expose credentials. Be concise." },
      { role: "user", content:
        `Analyze this test result.
Test point: ${JSON.stringify(input.testPoint)}
Expected: ${input.expected}
Actual: ${input.actual}
Give likely defect/observation and severity recommendation.` }
    ]
  });
  return response.output_text;
}
