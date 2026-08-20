import { stakeFor, type EscrowAction } from "./web3/escrow";
import type { TaskSummary } from "./api/tasks";

/// A role is a relationship to one task, not a property of an account: the same wallet can be
/// the requester on one task and the Agent on another. Only the arbiter is global, which is why
/// it is read from the contract instead of from the task.
export type TaskRole = "requester" | "agent" | "arbiter" | "observer";

const REVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function is(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function roleOf(
  task: TaskSummary,
  account: string | null,
  arbiter: string | null,
): TaskRole {
  if (is(task.requesterWallet, account)) return "requester";
  if (is(task.agentWallet, account)) return "agent";
  // The arbiter has no standing on a task until it is actually disputed — resolveDispute is the
  // only thing they can call, and it only works from Disputed.
  if (is(arbiter, account) && task.status === "DISPUTED") return "arbiter";
  return "observer";
}

export const roleLabels: Record<TaskRole, string> = {
  requester: "我是需求方",
  agent: "我是接单 Agent",
  arbiter: "我是仲裁人",
  observer: "旁观",
};

export type AvailableAction = {
  action: EscrowAction;
  label: string;
  hint: string;
  danger?: boolean;
  favorAgent?: boolean;
  stakeWei?: bigint;
};

function submittedAt(task: TaskSummary): number | null {
  const entry = task.history.find((step) => step.to === "SUBMITTED");
  return entry ? new Date(entry.at).getTime() : null;
}

/// Mirrors the guards in AgentTaskEscrow.sol so the UI only offers what would actually succeed.
/// This is an affordance, never a control: the contract is the thing that enforces any of it,
/// and a hidden button is not a permission check.
export function actionsFor(
  task: TaskSummary,
  account: string | null,
  arbiter: string | null,
  now: number,
): AvailableAction[] {
  if (!account || task.chainTaskId === undefined) return [];

  const role = roleOf(task, account, arbiter);
  const isParty = role === "requester" || role === "agent";
  const actions: AvailableAction[] = [];

  if (task.status === "PUBLISHED") {
    if (role === "requester") {
      actions.push({
        action: "CANCEL_TASK",
        label: "撤回任务",
        hint: "无人接单时可取回全部预算",
        danger: true,
      });
    } else {
      actions.push({
        action: "ACCEPT_TASK",
        label: "接单",
        hint: `需同时质押 ${Number(stakeFor(task.budget.amount)) / 1e18} ETH（预算的 6%）`,
        stakeWei: stakeFor(task.budget.amount),
      });
    }
  }

  if (task.status === "IN_PROGRESS") {
    if (role === "agent") {
      actions.push({ action: "SUBMIT_TASK", label: "提交交付", hint: "提交后进入 7 天验收窗口" });
    }
    if (isParty && now > new Date(task.deadline).getTime()) {
      actions.push({
        action: "CLAIM_DELIVERY_TIMEOUT",
        label: "领取交付超时",
        hint: "预算退回需求方，质押退还 Agent（D7）",
        danger: true,
      });
    }
  }

  if (task.status === "SUBMITTED") {
    if (role === "requester") {
      actions.push({ action: "APPROVE_TASK", label: "验收放款", hint: "预算与质押一并支付给 Agent" });
    }
    if (isParty) {
      actions.push({ action: "DISPUTE_TASK", label: "发起争议", hint: "转交仲裁人裁决", danger: true });
    }
    const settlesAt = submittedAt(task);
    if (isParty && settlesAt !== null && now > settlesAt + REVIEW_WINDOW_MS) {
      actions.push({
        action: "CLAIM_REVIEW_TIMEOUT",
        label: "领取验收超时",
        hint: "需求方 7 天未响应，自动结算给 Agent（D7）",
      });
    }
  }

  if (task.status === "DISPUTED" && role === "arbiter") {
    actions.push({
      action: "RESOLVE_DISPUTE",
      label: "裁决：判给 Agent",
      hint: "预算与质押支付给 Agent",
      favorAgent: true,
    });
    actions.push({
      action: "RESOLVE_DISPUTE",
      label: "裁决：判给需求方",
      hint: "预算退回需求方，质押仍退还 Agent（D5b）",
      favorAgent: false,
      danger: true,
    });
  }

  return actions;
}
