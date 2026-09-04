import { GoogleGenAI } from "@google/genai";
import type { AgentAction, TestPoint } from "./types.js";

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const system = `
You are an autonomous senior QA engineer operating a STAGING web application.

Your job is to:
1. Understand the feature requested by the user.
2. Discover relevant test points autonomously.
3. Execute those test points through browser actions.
4. Observe actual application behavior.
5. Compare actual behavior against expected behavior.
6. Record a clear QA result.

Rules:
1. Stay within the requested feature scope.
2. Prefer safe, non-destructive actions.
3. Never perform real payments, production actions, deletion,
   irreversible actions, or security-sensitive changes.
4. Use supplied test credentials only for login.
5. Never repeat passwords in reasoning, logs, screenshots descriptions,
   or reports.
6. Explore the UI when necessary.
7. Do not assume selectors.
8. Generate a broad but practical set of test points:
   positive, negative, validation, boundary/state,
   integration, and error handling when relevant.
9. A test point must be based on something that can actually
   be executed or observed.
10. For each browser step, return EXACTLY ONE JSON action object.
11. After each action, the runner will provide a fresh accessible UI snapshot.
12. If an action fails, adapt using the current UI rather than blindly repeating it.
13. When enough evidence exists, finish with PASS, FAIL, or BLOCKED.
14. Keep summaries concise and factual.

Action schema:

goto:
{type:"goto", url:string}

click:
{type:"click", target:string}

fill:
{type:"fill", target:string, value:string}

select:
{type:"select", target:string, value:string}

press:
{type:"press", target:string, key:string}

wait:
{type:"wait", ms:number}

screenshot:
{type:"screenshot", name:string}

assert:
{type:"assert", target:string, expected:string}

finish:
{type:"finish", status:"PASS"|"FAIL"|"BLOCKED", summary:string}

For targets, use:
- visible text
- accessible role/name
- label
- placeholder
- concise description

Do not emit CSS/XPath unless absolutely necessary.
`;

async function generateJson<T>(prompt: string): Promise<T> {
  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const text = response.text?.trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return JSON.parse(text) as T;
}

async function generateText(prompt: string): Promise<string> {
  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction:
        "You are a QA analyst. Do not expose credentials. Be concise.",
      temperature: 0.2,
    },
  });

  return response.text?.trim() || "";
}

export async function planTestPoints(task: string): Promise<TestPoint[]> {
  return generateJson<TestPoint[]>(`
Create the initial test-point plan for this QA task.

Task:
${task}

Return ONLY a valid JSON array.

Each test point should contain the fields required by the TestPoint
type used by this project.
`);
}

export async function nextAction(context: {
  task: string;
  testPoint: TestPoint;
  snapshot: string;
  history: string;
}): Promise<AgentAction> {
  return generateJson<AgentAction>(`
Determine the next browser action for the current QA test.

Task:
${context.task}

Current test point:
${JSON.stringify(context.testPoint)}

Recent execution history:
${context.history}

Current accessible UI snapshot:
${context.snapshot}

Return ONLY ONE valid JSON action object.

Do not return markdown.
Do not return an array.
Do not explain the action.
`);
}

export async function analyzeFailure(input: {
  testPoint: TestPoint;
  expected: string;
  actual: string;
}): Promise<string> {
  return generateText(`
Analyze this QA test result.

Test point:
${JSON.stringify(input.testPoint)}

Expected:
${input.expected}

Actual:
${input.actual}

Provide:
1. Likely defect or observation
2. Severity recommendation
3. Short explanation

Do not expose credentials.
Be concise.
`);
}
