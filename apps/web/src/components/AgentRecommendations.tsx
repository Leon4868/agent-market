import { useEffect, useState } from "react";

import { fetchMatches, type MatchCandidate } from "../api/matches";

// The engine tags its explore pick with this exact reason; it is the only signal that tells a
// newcomer apart from an agent that simply scored low.
const EXPLORE_REASON = "探索位随机选出";

/// D3 lays out three slots. Fewer come back when the category simply has fewer agents, which is
/// the hard filter working, not a failure — but it needs saying, or one lonely card reads as one.
const MAX_CANDIDATES = 3;

type AgentRecommendationsProps = {
  category: string;
  onBrowseAll: () => void;
};

export function AgentRecommendations({ category, onBrowseAll }: AgentRecommendationsProps) {
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    fetchMatches({ category })
      .then((result) => {
        if (active) setCandidates(result);
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "推荐服务调用失败");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [category]);

  const provenance = candidates[0];

  return (
    <div className="panel content-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">EXPLAINABLE MATCHING</p>
          <h3>为你推荐的 Agent</h3>
        </div>
        <button className="text-button" onClick={onBrowseAll} type="button">查看全部 →</button>
      </div>

      {provenance ? (
        <p className="panel-note">
          {`分类「${category}」 · ${provenance.algorithm} · ${provenance.modelVersion}`}
        </p>
      ) : null}

      {!isLoading && !error && candidates.length > 0 && candidates.length < MAX_CANDIDATES ? (
        <p className="state-note">
          {`「${category}」分类下只有 ${candidates.length} 个 Agent 通过硬筛选。推荐位不会用其他分类的 Agent 补齐——凑数会让「匹配理由」失去意义。`}
        </p>
      ) : null}

      {isLoading ? <p className="state-note">正在向推荐引擎请求候选…</p> : null}

      {error ? (
        <p className="state-note state-note--error">
          {`${error}。确认 API (3000) 和推荐引擎 (8080) 都已启动。`}
        </p>
      ) : null}

      {!isLoading && !error && candidates.length === 0 ? (
        <p className="state-note">{`推荐引擎在「${category}」分类下没有找到符合硬筛选条件的 Agent。`}</p>
      ) : null}

      <div className="agent-list">
        {candidates.map((candidate) => {
          const isExplore = candidate.reasons.includes(EXPLORE_REASON);
          const hasHistory = candidate.metrics.completedTasks > 0;

          return (
            <article className="agent-card" key={candidate.id}>
              <div className={`agent-avatar agent-avatar--${candidate.id.slice(-1)}`}>
                {candidate.name.charAt(0)}
              </div>
              <div className="agent-card__main">
                <div className="agent-card__title">
                  <h4>{candidate.name}</h4>
                  <span>{candidate.category}</span>
                  {isExplore ? <span className="agent-badge--new">✦ 新 Agent</span> : null}
                </div>
                <div className="reason-list">
                  {candidate.reasons.map((reason) => <span key={reason}>{reason}</span>)}
                </div>
                <div className="tag-list">
                  {candidate.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                </div>
              </div>
              <div className="agent-metrics">
                <div>
                  <strong>{hasHistory ? candidate.score.toFixed(2) : "—"}</strong>
                  <span>匹配分</span>
                </div>
                <div>
                  <strong>
                    {hasHistory ? `${(candidate.metrics.completionRate * 100).toFixed(1)}%` : "—"}
                  </strong>
                  <span>完成率</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
