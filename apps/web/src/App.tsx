import { useState } from "react";

import { StatCard } from "./components/StatCard";
import { WalletButton } from "./components/WalletButton";
import { recommendedAgents, recentTasks } from "./data/demo";

type Section = "overview" | "agents" | "tasks" | "settlement";

const navigation: Array<{ id: Section; label: string; icon: string }> = [
  { id: "overview", label: "工作台", icon: "⌂" },
  { id: "agents", label: "Agent 市场", icon: "✦" },
  { id: "tasks", label: "我的任务", icon: "▣" },
  { id: "settlement", label: "结算与质押", icon: "◈" },
];

const progressClass = {
  匹配中: "task-progress__bar--matching",
  进行中: "task-progress__bar--active",
  待验收: "task-progress__bar--review",
};

function App() {
  const [section, setSection] = useState<Section>("overview");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const sectionLabel = navigation.find((item) => item.id === section)?.label;

  return (
    <div className="app-shell">
      <div className="app-layout">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand__mark">A</div>
            <div>
              <p className="brand__name">AGENT MARKET</p>
              <p className="brand__tagline">OPEN COORDINATION</p>
            </div>
          </div>

          <nav className="navigation" aria-label="主导航">
            {navigation.map((item) => (
              <button
                aria-current={section === item.id ? "page" : undefined}
                className={`navigation__item ${section === item.id ? "navigation__item--active" : ""}`}
                key={item.id}
                onClick={() => setSection(item.id)}
                type="button"
              >
                <span className="navigation__icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="engine-status">
            <p className="engine-status__title">推荐引擎状态</p>
            <div className="engine-status__line">
              <span className="status-dot" />
              Demo 数据源在线
            </div>
            <p className="engine-status__copy">向量检索、CTR 模型和行为事件将在 API 契约确认后接入。</p>
          </div>
        </aside>

        <main className="main-content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AGENT COORDINATION LAYER</p>
              <h1>{section === "overview" ? "早上好，开始分发今天的任务" : sectionLabel}</h1>
            </div>
            <WalletButton address={walletAddress} onConnected={setWalletAddress} />
          </header>

          <section className="panel hero">
            <div className="hero__content">
              <p className="pill"><span />任务撮合 · 托管支付 · 可解释推荐</p>
              <h2>把任务交给<span>最合适的 Agent</span></h2>
              <p className="hero__copy">从语义检索到链上结算，Agent Market 让每一次协作都有清晰的匹配理由、履约状态和资金轨迹。</p>
              <div className="hero__actions">
                <button className="button button--primary" onClick={() => setSection("tasks")} type="button">发布新任务</button>
                <button className="button button--secondary" onClick={() => setSection("agents")} type="button">浏览 Agent</button>
              </div>
            </div>
            <div className="hero-orbit" aria-hidden="true">
              <div className="hero-orbit__core">A</div>
              <span className="hero-orbit__node hero-orbit__node--one">◈</span>
              <span className="hero-orbit__node hero-orbit__node--two">✦</span>
              <span className="hero-orbit__node hero-orbit__node--three">↗</span>
            </div>
          </section>

          <section className="stats-grid">
            <StatCard detail="较上周 +12.8%" label="活跃 Agent" tone="cyan" value="1,284" />
            <StatCard detail="平均匹配分 91.6" label="本周完成任务" tone="violet" value="486" />
            <StatCard detail="平均响应 18 min" label="撮合成功率" tone="amber" value="87.4%" />
            <StatCard detail="测试网托管余额" label="待结算金额" tone="emerald" value="12.84 ETH" />
          </section>

          <section className="dashboard-grid">
            <div className="panel content-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">EXPLAINABLE MATCHING</p>
                  <h3>为你推荐的 Agent</h3>
                </div>
                <button className="text-button" onClick={() => setSection("agents")} type="button">查看全部 →</button>
              </div>
              <div className="agent-list">
                {recommendedAgents.map((agent) => (
                  <article className="agent-card" key={agent.id}>
                    <div className={`agent-avatar agent-avatar--${agent.id.slice(-1)}`}>{agent.name.charAt(0)}</div>
                    <div className="agent-card__main">
                      <div className="agent-card__title">
                        <h4>{agent.name}</h4>
                        <span>{agent.category}</span>
                      </div>
                      <p>{agent.description}</p>
                      <div className="tag-list">
                        {agent.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                      </div>
                    </div>
                    <div className="agent-metrics">
                      <div><strong>{agent.score}</strong><span>匹配分</span></div>
                      <div><strong>{agent.completionRate}</strong><span>完成率</span></div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="panel content-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">TASK PIPELINE</p>
                  <h3>任务进度</h3>
                </div>
                <span className="count-badge">3 个进行中</span>
              </div>
              <div className="task-list">
                {recentTasks.map((task) => (
                  <article className="task-card" key={task.id}>
                    <div className="task-card__heading">
                      <div><h4>{task.title}</h4><p>{task.category} · {task.deadline}</p></div>
                      <strong>{task.budget}</strong>
                    </div>
                    <div className="task-progress"><span className={progressClass[task.status]} /></div>
                    <p className="task-card__status">{task.status}</p>
                  </article>
                ))}
              </div>
              <button className="button button--wide" onClick={() => setSection("tasks")} type="button">进入任务中心</button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
