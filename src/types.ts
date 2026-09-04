export type AgentAction =
  | { type: "goto"; url: string; reason?: string }
  | { type: "click"; target: string; reason?: string }
  | { type: "fill"; target: string; value: string; reason?: string }
  | { type: "select"; target: string; value: string; reason?: string }
  | { type: "press"; target: string; key: string; reason?: string }
  | { type: "wait"; ms: number; reason?: string }
  | { type: "screenshot"; name: string; reason?: string }
  | { type: "assert"; target: string; expected: string; reason?: string }
  | { type: "finish"; status: "PASS" | "FAIL" | "BLOCKED"; summary: string };

export type StepLog = {
  runId: string;
  time: string;
  step: number;
  action: AgentAction;
  status: "STARTED" | "PASS" | "FAIL";
  message?: string;
  screenshot?: string;
};

export type TestPoint = {
  id: string;
  title: string;
  objective: string;
  expected: string;
};
