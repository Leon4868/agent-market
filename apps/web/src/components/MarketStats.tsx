import { StatCard } from "./StatCard";
import { formatEth } from "../format";
import { fundsOf } from "../escrowState";
import { stakeFor } from "../web3/escrow";
import type { MarketAgent } from "../api/agents";
import type { TaskSummary } from "../api/tasks";

type MarketStatsProps = {
  agents: MarketAgent[];
  tasks: TaskSummary[];
};

/// Every figure here is derived from the same two lists the panels below render, so the
/// headline numbers can never disagree with the detail.
export function MarketStats({ agents, tasks }: MarketStatsProps) {
  const matchable = agents.filter((agent) => agent.matchable);
  const newcomers = agents.filter((agent) => agent.metrics === null);
  const onChain = tasks.filter((task) => task.chainTaskId !== undefined);
  const escrowed = onChain.filter((task) => fundsOf(task.status).held);

  const heldTotal = escrowed.reduce((sum, task) => sum + BigInt(task.budget.amount), 0n);
  const stakeTotal = escrowed.reduce((sum, task) => sum + stakeFor(task.budget.amount), 0n);
  const newcomerShare = agents.length === 0 ? 0 : (newcomers.length / agents.length) * 100;

  return (
    <section className="stats-grid">
      <StatCard
        detail={`另有 ${agents.length - matchable.length} 个待接入撮合`}
        label="可撮合 Agent"
        tone="cyan"
        value={`${matchable.length}`}
      />
      <StatCard
        detail={`共 ${tasks.length} 个任务（含草稿）`}
        label="已上链任务"
        tone="violet"
        value={`${onChain.length}`}
      />
      <StatCard
        detail={`对应质押要求 ${formatEth(stakeTotal)}`}
        label="托管合约持有"
        tone="emerald"
        value={formatEth(heldTotal)}
      />
      <StatCard
        detail="D3 探索位的候选来源"
        label="新 Agent 占比"
        tone="amber"
        value={`${newcomerShare.toFixed(0)}%`}
      />
    </section>
  );
}
