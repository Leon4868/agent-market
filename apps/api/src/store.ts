// In-memory stand-in for the PostgreSQL layer. Everything here is keyed and shaped the way the
// real tables will be (see docs/decisions.md D6), so swapping the implementation should not
// change any caller. It is deliberately process-local: restarting the API clears it.
import { randomUUID } from "node:crypto";

export type TaskStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "MATCHING"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "COMPLETED"
  | "SETTLED"
  | "DISPUTED"
  | "RESOLVED"
  | "CANCELLED";

export type TaskBudget = {
  chainId: number;
  asset: "native" | "erc20";
  amount: string;
};

/// api-contract.md requires every off-chain transition to record who did it, the states either
/// side of it, when, and the chain transaction behind it when there is one.
export type TaskTransition = {
  at: string;
  from: TaskStatus | null;
  to: TaskStatus;
  actor: string;
  transactionHash?: string;
};

export type StoredTask = {
  id: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  expertise: string[];
  budget: TaskBudget;
  deadline: string;
  requesterWallet: string;
  /// Set when an Agent accepts on chain; read back from the TaskAccepted event, never from
  /// whatever the client claimed.
  agentWallet?: string;
  status: TaskStatus;
  chainTaskId?: string;
  transactionHash?: string;
  createdAt: string;
  history: TaskTransition[];
};

export type StoredAgent = {
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  authorBio: string;
  walletAddress: string;
  endpoint: string;
  /// Held so the runtime can resolve the key later; never returned by any handler.
  credentialRef: string;
  status: "DRAFT";
  createdAt: string;
};

const agents = new Map<string, StoredAgent>();
const tasks = new Map<string, StoredTask>();

export function saveAgent(input: Omit<StoredAgent, "id" | "status" | "createdAt">): StoredAgent {
  const agent: StoredAgent = {
    ...input,
    id: `agent_${randomUUID()}`,
    status: "DRAFT",
    createdAt: new Date().toISOString(),
  };
  agents.set(agent.id, agent);
  return agent;
}

export function listAgents(): StoredAgent[] {
  return [...agents.values()];
}

export function findAgent(agentId: string): StoredAgent | undefined {
  return agents.get(agentId);
}

export function saveTask(
  input: Omit<StoredTask, "id" | "status" | "createdAt" | "history">,
  actor: string,
): StoredTask {
  const createdAt = new Date().toISOString();
  const task: StoredTask = {
    ...input,
    id: `task_${randomUUID()}`,
    status: "DRAFT",
    createdAt,
    history: [{ at: createdAt, from: null, to: "DRAFT", actor }],
  };
  tasks.set(task.id, task);
  return task;
}

export function findTask(taskId: string): StoredTask | undefined {
  return tasks.get(taskId);
}

export function listTasks(): StoredTask[] {
  return [...tasks.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function advanceTask(
  taskId: string,
  to: TaskStatus,
  actor: string,
  chain?: { transactionHash: string; chainTaskId: string; agentWallet?: string },
): StoredTask | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;

  task.history.push({
    at: new Date().toISOString(),
    from: task.status,
    to,
    actor,
    transactionHash: chain?.transactionHash,
  });
  task.status = to;
  if (chain) {
    task.transactionHash = chain.transactionHash;
    task.chainTaskId = chain.chainTaskId;
    if (chain.agentWallet) task.agentWallet = chain.agentWallet;
  }
  return task;
}

/// Test-only: the store is module state, so suites would otherwise leak into each other.
export function resetStore() {
  agents.clear();
  tasks.clear();
}
