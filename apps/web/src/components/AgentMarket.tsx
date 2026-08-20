import { useMemo, useState } from "react";

import type { MarketAgent } from "../api/agents";

const ALL = "全部";

function matchesKeyword(agent: MarketAgent, keyword: string) {
  const haystack = [agent.name, agent.category, agent.description, ...agent.tags]
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword.toLowerCase());
}

type AgentMarketProps = {
  agents: MarketAgent[];
  error: string | null;
  isLoading: boolean;
};

export function AgentMarket({ agents, error, isLoading }: AgentMarketProps) {
  const [category, setCategory] = useState(ALL);
  const [keyword, setKeyword] = useState("");

  // Categories come from the catalog itself; a hardcoded list would drift the moment an Agent
  // registers under a new one.
  const categories = useMemo(
    () => [ALL, ...new Set(agents.map((agent) => agent.category))],
    [agents],
  );

  const visible = agents.filter(
    (agent) =>
      (category === ALL || agent.category === category) &&
      (keyword.trim() === "" || matchesKeyword(agent, keyword.trim())),
  );

  const pending = agents.filter((agent) => !agent.matchable).length;

  return (
    <div className="panel content-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AGENT CATALOG</p>
          <h3>Agent 市场</h3>
        </div>
        <span className="count-badge">{`${agents.length} 个 Agent`}</span>
      </div>

      {pending > 0 ? (
        <p className="panel-note">
          {`其中 ${pending} 个已在本地注册但尚未接入撮合引擎，暂时不会出现在推荐结果里。`}
        </p>
      ) : null}

      <div className="market-controls">
        <input
          aria-label="搜索 Agent"
          className="market-search"
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="按名称、标签或能力搜索"
          type="search"
          value={keyword}
        />
        <div className="filter-chips">
          {categories.map((item) => (
            <button
              aria-pressed={category === item}
              className={`filter-chip ${category === item ? "filter-chip--active" : ""}`}
              key={item}
              onClick={() => setCategory(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <p className="state-note">正在读取 Agent 目录…</p> : null}
      {error ? (
        <p className="state-note state-note--error">
          {`${error}。确认 API (3000) 和推荐引擎 (8080) 都已启动。`}
        </p>
      ) : null}
      {!isLoading && !error && visible.length === 0 ? (
        <p className="state-note">没有符合当前筛选条件的 Agent。</p>
      ) : null}

      <div className="agent-list">
        {visible.map((agent) => (
          <article className="agent-card" key={agent.id}>
            <div className={`agent-avatar agent-avatar--${agent.id.slice(-1)}`}>
              {agent.name.charAt(0)}
            </div>
            <div className="agent-card__main">
              <div className="agent-card__title">
                <h4>{agent.name}</h4>
                <span>{agent.category}</span>
                {agent.metrics ? null : <span className="agent-badge--new">✦ 新 Agent</span>}
                {agent.matchable ? null : (
                  <span className="agent-badge--pending">待接入撮合</span>
                )}
              </div>
              {agent.description ? (
                <p>{agent.description}</p>
              ) : null}
              <div className="tag-list">
                {agent.tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            </div>
            <div className="agent-metrics">
              <div>
                <strong>
                  {agent.metrics ? `${(agent.metrics.completionRate * 100).toFixed(1)}%` : "—"}
                </strong>
                <span>完成率</span>
              </div>
              <div>
                <strong>{agent.metrics ? agent.metrics.qualityScore.toFixed(2) : "—"}</strong>
                <span>质量分</span>
              </div>
              <div>
                <strong>{agent.metrics ? agent.metrics.completedTasks : "0"}</strong>
                <span>已完成</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
