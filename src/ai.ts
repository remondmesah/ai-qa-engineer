import { GoogleGenAI, Type } from "@google/genai";
import type { AgentAction, TestPoint } from "./types.js";

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

/**
 * Call Gemini with automatic retry for temporary availability errors.
 *
 * Retry strategy:
 * Attempt 1 → immediate
 * Attempt 2 → wait 5 seconds
 * Attempt 3 → wait 10 seconds
 *
 * Only temporary Gemini availability errors are retried.
 * Other errors are immediately propagated.
 */
async function generateWithRetry(
  params: Parameters<typeof client.models.generateContent>[0],
  maxRetries = 3
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.models.generateContent(params);
    } catch (error) {
      lastError = error;

      const message =
        error instanceof Error ? error.message : String(error);

      const retryable =
        message.includes("503") ||
        message.includes("UNAVAILABLE") ||
        message.includes("high demand") ||
        message.includes("temporarily unavailable");

      if (!retryable || attempt === maxRetries) {
        throw error;
      }

      const delay = attempt * 5000;

      console.log(
        `Gemini temporarily unavailable. ` +
          `Retry ${attempt}/${maxRetries} in ${delay / 1000}s...`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

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

APPLICATION FLOW:

For the Pindah Meja feature, the normal application navigation flow is:

1. Open the STAGING application.
2. Login using the QA credentials supplied through environment variables.
3. After successful login, select the user type "Kasir 5".
4. Select "Default Printer" with value "200".
5. Click "Simpan".
6. Enter the WebPOS application.
7. Open the "Order" menu.
8. The table/meja interface is displayed.
9. Locate the "Pindah Meja" functionality.
10. Select the source/origin table.
11. Select the destination table.
12. Click "Apply".
13. Observe and verify the resulting table state.

IMPORTANT LOGIN RULE:

- When credentials are required, use the following placeholders:
  - Username: "{{QA_USERNAME}}"
  - Password: "{{QA_PASSWORD}}"
- Never invent credentials.
- Never hard-code credentials.
- Never expose actual credentials in reasoning, summaries, screenshots descriptions, logs, or reports.
- The browser runner will resolve these placeholders from environment variables.
- If authentication cannot be completed because credentials are unavailable or invalid, use BLOCKED rather than guessing.

IMPORTANT APPLICATION NAVIGATION RULE:

- Do not attempt to access "Pindah Meja" directly before completing the required login and navigation flow.
- The Pindah Meja feature is located inside:
  Login → user type/printer configuration → WebPOS → Order → Meja.
- If the actual UI differs from this documented flow, follow the actual visible UI and adapt.
- Do not blindly repeat an action that fails.
- After each browser action, use the fresh UI snapshot to determine the next action.
- Do not assume that a page is ready merely because navigation succeeded.
- Confirm that the expected UI is actually visible before continuing whenever possible.

TEST COVERAGE SHOULD CONSIDER WHEN RELEVANT:

- Positive scenarios
- Negative scenarios
- Required field validation
- Invalid input
- Boundary conditions
- Empty state
- Existing data
- Different source tables
- Different destination tables
- Same source and destination table
- Occupied destination table
- Available destination table
- Confirmation/cancellation
- Apply behavior
- State transitions
- UI behavior
- Integration behavior
- Error handling
- Data consistency
- Permission/access behavior when observable

PINDah MEJA TESTING:

When testing Pindah Meja, verify the actual observable behavior rather than assuming implementation details.

At minimum, consider:

1. Source table selection:
   - A valid source table can be selected.
   - The selected source table is visibly identified.

2. Destination table selection:
   - A valid destination table can be selected.
   - The selected destination table is visibly identified.

3. Valid table transfer:
   - Apply performs the intended table transfer when the combination is valid.
   - The source table state changes appropriately.
   - The destination table state changes appropriately.
   - Any relevant order/table information remains consistent.

4. Invalid or unsupported transfer:
   - Same source and destination table should be evaluated.
   - Occupied destination table should be evaluated when applicable.
   - Empty or unavailable selections should be evaluated when applicable.
   - The application should provide appropriate validation or feedback.

5. Apply behavior:
   - Apply should not report success when the operation fails.
   - Apply should result in the expected state transition when the operation succeeds.
   - The UI should remain consistent after the operation.

6. Error handling:
   - Errors should be presented clearly when observable.
   - The application should not silently perform an incorrect transfer.

7. Data consistency:
   - Verify the resulting source and destination table states.
   - Verify that the visible order/table information remains consistent after a successful move.

Do not assume every negative scenario is applicable.
Only execute scenarios that can be safely evaluated based on the actual staging data and UI.

SAFETY:

- This is a STAGING environment.
- Never perform real payments.
- Never perform destructive production actions.
- Never delete important data unless explicitly required and safe in staging.
- Never expose passwords or secrets.
- Never put credentials into reasoning, summaries, screenshots descriptions, or reports.
- Use supplied credentials only for authentication.
- Avoid unnecessary destructive or irreversible operations.
- Do not perform real financial transactions.
- Do not intentionally corrupt or destroy application data.

BROWSER INTERACTION:

- Explore the UI when necessary.
- Do not assume selectors.
- Prefer visible text, accessible role/name, label, placeholder, or concise descriptions.
- Do not use CSS/XPath unless absolutely necessary.
- Every browser action must be based on the current UI state.
- After every action, the runner will provide a fresh UI snapshot.
- If an action fails, adapt to the current UI instead of blindly repeating the same action.
- Do not assume that an element is a native HTML select.
- Inspect the visible UI before deciding whether to use select, click, or another action.
- Use screenshots when visual evidence is useful for the test result.
- Prefer small, observable steps.
- After important state-changing actions, verify the resulting UI before proceeding.

IMPORTANT CREDENTIAL RULE:

When the AI needs to fill a username or password field, it MUST use:

For username:
{{QA_USERNAME}}

For password:
{{QA_PASSWORD}}

Do not output the actual credential values.

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

If the application cannot be tested because of an environment,
authentication, missing data, unavailable functionality, or another
blocking condition, use BLOCKED instead of guessing.

Do not declare PASS merely because a button was clicked.

Verify the resulting application state whenever possible.

Do not declare FAIL merely because the UI differs from the expected wording.

Determine whether the actual behavior satisfies the test objective.

When evidence is insufficient to determine the result, continue testing
rather than guessing.

When a test cannot be safely executed because required staging data does
not exist, use BLOCKED and clearly explain the blocking condition.

Never claim that a backend/database state changed unless that change is
observable through the available application UI or other supplied evidence.
`;

export async function planTestPoints(task: string): Promise<TestPoint[]> {
  const response = await generateWithRetry({
    model,
    contents: `
Create the initial test-point plan for this QA task.

User task:
${task}

Generate a practical but comprehensive set of test points.

The test plan must respect the documented application flow in the system
instruction.

For the Pindah Meja feature, ensure that the required login and navigation
flow is considered before testing the actual feature.

Each test point must contain:
- id
- title
- objective
- expected

Generate test points that are practical to execute in a staging environment.

Do not create unnecessary destructive scenarios.

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
  const response = await generateWithRetry({
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

DECISION PROCESS:

1. Inspect the current UI snapshot carefully.
2. Determine the current application state.
3. Determine whether the required login/navigation flow has already been completed.
4. If not completed, continue the required flow one observable step at a time.
5. If credentials are required, use:
   - {{QA_USERNAME}} for username
   - {{QA_PASSWORD}} for password
6. Never invent or expose actual credentials.
7. Once WebPOS → Order → Meja is reached, execute the relevant Pindah Meja test step.
8. After state-changing actions such as Apply, inspect the resulting UI.
9. Do not assume success without observable evidence.
10. If the test point has enough evidence to determine its result, return a finish action.
11. If the environment prevents testing, return BLOCKED rather than guessing.

IMPORTANT:

- Follow the actual visible UI when it differs from the documented flow.
- Use only one action at a time.
- Do not skip required navigation steps.
- Do not repeat a failed action blindly.
- Prefer visible text and accessible names.
- If a control is not a native HTML select, do not use the select action.
- Use click when the UI behaves like a custom dropdown, button, card, table, or selectable element.
- Use screenshots when useful as evidence.

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
  const response = await generateWithRetry({
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

Analyze only the evidence provided.

Do not invent backend behavior.

Do not expose credentials or secrets.
`,
    config: {
      systemInstruction: `
You are a senior QA analyst.

Analyze evidence objectively.

Do not invent behavior that was not observed.

Do not expose credentials or secrets.

Keep the response concise and suitable for a QA report.

A test should only be considered failed when the observed behavior
does not satisfy the expected behavior.

If the evidence is insufficient to determine a defect, state that
the evidence is insufficient rather than inventing a cause.
`,
    },
  });

  return response.text?.trim() || "No AI analysis was returned.";
}
