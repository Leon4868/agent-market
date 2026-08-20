export type DraftTask = {
  id: string;
  title: string;
  status: string;
};

export type CreateTaskInput = {
  title: string;
  category: string;
  description: string;
  tags: string[];
  expertise: string[];
  budget: { chainId: number; asset: "native"; amount: string };
  deadline: string;
  requesterWallet: string;
};

type ErrorBody = {
  error?: { message?: string; issues?: Array<{ path: string; message: string }> };
};

export async function createDraftTask(input: CreateTaskInput): Promise<DraftTask> {
  const response = await fetch("/v1/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = (await response.json().catch(() => null)) as
    | ({ data?: DraftTask } & ErrorBody)
    | null;

  if (!response.ok) {
    const issue = body?.error?.issues?.[0];
    const detail = issue ? `${issue.path}：${issue.message}` : body?.error?.message;
    throw new Error(detail ?? `任务服务返回 ${response.status}`);
  }
  if (!body?.data) {
    throw new Error("任务服务未返回任务信息");
  }
  return body.data;
}

export type TaskTransition = {
  at: string;
  from: string | null;
  to: string;
  actor: string;
  transactionHash?: string;
};

export type TaskSummary = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  budget: { chainId: number; asset: string; amount: string };
  deadline: string;
  status: string;
  requesterWallet: string;
  agentWallet?: string;
  chainTaskId?: string;
  transactionHash?: string;
  history: TaskTransition[];
};

export async function listTasks(): Promise<TaskSummary[]> {
  const response = await fetch("/v1/tasks");
  if (!response.ok) throw new Error(`任务服务返回 ${response.status}`);
  const body = (await response.json()) as { data?: TaskSummary[] };
  return body.data ?? [];
}

/// Hands the broadcast transaction to the server, which re-reads it from the chain before it
/// will move the task along. The action tells the server which event to look for; it still
/// decides for itself whether the chain agrees.
export async function confirmChainTransaction(
  taskId: string,
  input: { action: string; chainId: number; transactionHash: string },
): Promise<TaskSummary> {
  const response = await fetch(`/v1/tasks/${taskId}/chain-transactions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = (await response.json().catch(() => null)) as
    | ({ data?: TaskSummary } & ErrorBody)
    | null;

  if (!response.ok) {
    throw new Error(body?.error?.message ?? `任务服务返回 ${response.status}`);
  }
  if (!body?.data) throw new Error("任务服务未返回任务信息");
  return body.data;
}
