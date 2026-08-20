export type AgentMetrics = {
  completionRate: number;
  qualityScore: number;
  communicationScore: number;
  disputeRate: number;
  scaleScore: number;
  completedTasks: number;
};

export type MatchCandidate = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  metrics: AgentMetrics;
  score: number;
  reasons: string[];
  algorithm: string;
  modelVersion: string;
};

type MatchRequest = {
  category?: string;
  query?: string;
  tags?: string[];
};

export async function fetchMatches(request: MatchRequest): Promise<MatchCandidate[]> {
  const response = await fetch("/v1/matches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });

  const body = (await response.json().catch(() => null)) as
    | { data?: MatchCandidate[]; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(body?.error?.message ?? `推荐服务返回 ${response.status}`);
  }
  return body?.data ?? [];
}
