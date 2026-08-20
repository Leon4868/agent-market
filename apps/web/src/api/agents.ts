import type { AgentMetrics } from "./matches";

export type MarketAgent = {
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  /// null when the Agent has no history worth ranking on: a newcomer's zero metrics are missing
  /// data, not a bad record, and showing them as 0% would read as the opposite.
  metrics: AgentMetrics | null;
  /// false while an Agent is registered here but not yet part of the dispatch engine's catalog.
  matchable: boolean;
};

export async function listAgents(): Promise<MarketAgent[]> {
  const response = await fetch("/v1/agents");
  const body = (await response.json().catch(() => null)) as
    | { data?: MarketAgent[]; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Agent 目录返回 ${response.status}`);
  }
  return body?.data ?? [];
}
