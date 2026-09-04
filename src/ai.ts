import { GoogleGenAI, Type } from "@google/genai";
import type { AgentAction, TestPoint } from "./types.js";

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const model = process.env.GEMINI_MODEL || "gemini-3.7-flash";

const system = `
You are an autonomous senior QA engineer operating a STAGING web application.

Your responsibility is to:
1. Understand the user's high-level testing request.
2. Discover the relevant functionality in the web application.
3. Generate practical and comprehensive test points.
4. Execute the test points through browser actions.
5. Observe the actual application behavior.
6. Compare actual behavior against expected behavior.
7. Adapt when the UI differs from expectations.
8. Determine PASS, FAIL, or BLOCKED based on evidence.
9. Produce concise QA findings suitable for a test report.

IMPORTANT:
The user may give only a high-level instruction such as:
"Lakukan testing terhadap fitur Pindah Meja."

You must then determine the relevant test coverage yourself.

TEST COVERAGE SHOULD CONSIDER WHEN RELEVANT:
- Positive scenarios
- Negative scenarios
- Required field validation
- Invalid input
- Boundary conditions
- Empty state
- Existing data
- Different selections
- Confirmation/cancellation
- State transitions
- UI behavior
- Integration behavior
- Error handling
- Data consistency
- Permission/access behavior when observable

SAFETY:
- This is a STAGING environment.
- Never perform real payments.
- Never perform destructive production actions.
- Never delete important data unless explicitly required and safe in staging.
- Never expose passwords or secrets.
- Never put credentials into reasoning, summaries, screenshots descriptions, or reports.
- Use supplied credentials only for authentication.

BROWSER INTERACTION:
- Explore the UI when necessary.
- Do not assume selectors.
- Prefer visible text, accessible role/name, label, placeholder, or concise descriptions.
- Do not use CSS/XPath unless absolutely necessary.
- Every browser action must be based on the current UI state.
- After every action, the runner will provide a fresh UI snapshot.
- If an action fails, adapt to the current UI instead of blindly repeating the same action.

IMPORTANT EXECUTION RULE:
For nextAction(), return EXACTLY ONE JSON action object.
Do not return markdown.
Do not return explanations outside the JSON object.

AVAILABLE ACTIONS:

goto:
{
  "type": "goto",
  "url": "https://example.com"
}

click:
{
  "type": "click",
  "target": "visible button or element",
  "reason": "why this action is required"
}

fill:
{
  "type": "fill",
  "target": "field label or placeholder",
  "value": "value to enter",
  "reason": "why this action is required"
}

select:
{
  "type": "select",
  "target": "select element",
  "value": "option value",
  "reason": "why this action is required"
}

press:
{
  "type": "press",
  "target": "field or element",
  "key": "Enter",
  "reason": "why this action is required"
}

wait:
{
  "type": "wait",
  "ms": 1000,
  "reason": "why waiting is required"
}

screenshot:
{
  "type": "screenshot",
  "name": "meaningful-name",
  "reason": "why evidence is required"
}

assert:
{
  "type": "assert",
  "target": "visible element",
  "expected": "expected visible result",
  "reason": "why this assertion is required"
}

finish:
{
  "type": "finish",
  "status": "PASS",
  "summary": "concise result"
}

VALID FINISH STATUS:
- PASS
- FAIL
- BLOCKED

IMPORTANT:
A PASS or FAIL decision must be based on observable evidence.
If the application cannot be tested because of an environment, authentication,
missing data, unavailable functionality, or another blocking condition,
use BLOCKED instead of guessing.
`;

export async function planTestPoints(task: string): Promise<TestPoint[]> {
  const response = await client.models.generateContent({
    model,
    contents: `
Create the initial test-point plan for this QA task.

User task:
${task}

Generate a practical but comprehensive set of test points.

Each test point must contain:
- id
- title
- objective
- expected

Return ONLY the JSON array.
`,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: {
              type: Type.STRING,
            },
            title: {
              type: Type.STRING,
            },
            objective: {
              type: Type.STRING,
            },
            expected: {
              type: Type.STRING,
            },
          },
          required: ["id", "title", "objective", "expected"],
        },
      },
    },
  });

  const text = response.text?.trim();

  if (!text) {
    throw new Error("Gemini returned an empty test-point plan.");
  }

  const parsed = JSON.parse(text);

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini returned an invalid test-point format.");
  }

  return parsed as TestPoint[];
}

export async function nextAction(context: {
  task: string;
  testPoint: TestPoint;
  snapshot: string;
  history: string;
}): Promise<AgentAction> {
  const response = await client.models.generateContent({
    model,
    contents: `
Determine the SINGLE next browser action required to execute the current QA test point.

TASK:
${context.task}

CURRENT TEST POINT:
${JSON.stringify(context.testPoint)}

RECENT EXECUTION HISTORY:
${context.history || "(No previous actions.)"}

CURRENT ACCESSIBLE UI SNAPSHOT:
${context.snapshot}

Decide what should happen next based ONLY on the current observable state.

If the test point has enough evidence to determine its result,
return a finish action.

Otherwise return exactly ONE browser action.

Return ONLY one JSON action object.
`,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: [
              "goto",
              "click",
              "fill",
              "select",
              "press",
              "wait",
              "screenshot",
              "assert",
              "finish",
            ],
          },

          url: {
            type: Type.STRING,
          },

          target: {
            type: Type.STRING,
          },

          value: {
            type: Type.STRING,
          },

          key: {
            type: Type.STRING,
          },

          ms: {
            type: Type.INTEGER,
          },

          name: {
            type: Type.STRING,
          },

          expected: {
            type: Type.STRING,
          },

          reason: {
            type: Type.STRING,
          },

          status: {
            type: Type.STRING,
            enum: ["PASS", "FAIL", "BLOCKED"],
          },

          summary: {
            type: Type.STRING,
          },
        },
        required: ["type"],
      },
    },
  });

  const text = response.text?.trim();

  if (!text) {
    throw new Error("Gemini returned an empty browser action.");
  }

  const parsed = JSON.parse(text);

  return parsed as AgentAction;
}

export async function analyzeFailure(input: {
  testPoint: TestPoint;
  expected: string;
  actual: string;
}): Promise<string> {
  const response = await client.models.generateContent({
    model,
    contents: `
Analyze the following QA test result.

TEST POINT:
${JSON.stringify(input.testPoint)}

EXPECTED:
${input.expected}

ACTUAL:
${input.actual}

Provide a concise QA analysis containing:
- Observation
- Likely defect or cause
- Severity recommendation
- Suggested follow-up

Do not expose credentials or secrets.
`,
    config: {
      systemInstruction: `
You are a senior QA analyst.
Analyze evidence objectively.
Do not invent behavior that was not observed.
Do not expose credentials or secrets.
Keep the response concise and suitable for a QA report.
`,
    },
  });

  return response.text?.trim() || "No AI analysis was returned.";
}
