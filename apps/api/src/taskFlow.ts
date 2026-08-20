import type { TaskStatus } from "./store.js";

/// The off-chain mirror of AgentTaskEscrow's state machine. Each action names the event that
/// proves it happened, the statuses it may be applied from, and the status it produces. The
/// contract is the authority on whether an action is *allowed*; this table only decides how a
/// proven action moves the task record.
export const escrowActions = {
  CREATE_ESCROW: { event: "TaskCreated", from: ["DRAFT"] },
  ACCEPT_TASK: { event: "TaskAccepted", from: ["PUBLISHED"] },
  SUBMIT_TASK: { event: "TaskSubmitted", from: ["IN_PROGRESS"] },
  APPROVE_TASK: { event: "TaskCompleted", from: ["SUBMITTED"] },
  DISPUTE_TASK: { event: "TaskDisputed", from: ["SUBMITTED"] },
  RESOLVE_DISPUTE: { event: "DisputeResolved", from: ["DISPUTED"] },
  CLAIM_REVIEW_TIMEOUT: { event: "TaskCompleted", from: ["SUBMITTED"] },
  CLAIM_DELIVERY_TIMEOUT: { event: "TaskTimedOut", from: ["IN_PROGRESS"] },
  CANCEL_TASK: { event: "TaskCancelled", from: ["PUBLISHED"] },
} as const satisfies Record<string, { event: string; from: readonly TaskStatus[] }>;

export type EscrowAction = keyof typeof escrowActions;

export const escrowActionNames = Object.keys(escrowActions) as [EscrowAction, ...EscrowAction[]];

export function allowedFrom(action: EscrowAction, status: TaskStatus): boolean {
  return (escrowActions[action].from as readonly TaskStatus[]).includes(status);
}

/// D5b: an arbitration that favours the Agent settles like a normal completion, and one that
/// favours the requester unwinds the task — the stake goes back either way.
export function nextStatus(action: EscrowAction, facts: { favorAgent?: boolean }): TaskStatus {
  switch (action) {
    case "CREATE_ESCROW":
      return "PUBLISHED";
    case "ACCEPT_TASK":
      return "IN_PROGRESS";
    case "SUBMIT_TASK":
      return "SUBMITTED";
    case "APPROVE_TASK":
    case "CLAIM_REVIEW_TIMEOUT":
      return "COMPLETED";
    case "DISPUTE_TASK":
      return "DISPUTED";
    case "RESOLVE_DISPUTE":
      return facts.favorAgent ? "COMPLETED" : "CANCELLED";
    case "CLAIM_DELIVERY_TIMEOUT":
    case "CANCEL_TASK":
      return "CANCELLED";
  }
}
