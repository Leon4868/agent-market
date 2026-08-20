import { useCallback, useEffect, useState } from "react";

import { AgentMarket } from "./components/AgentMarket";
import { AgentRecommendations } from "./components/AgentRecommendations";
import { MarketStats } from "./components/MarketStats";
import { MyTasks } from "./components/MyTasks";
import { SettlementPanel } from "./components/SettlementPanel";
import { TaskPipeline } from "./components/TaskPipeline";
import { WalletButton } from "./components/WalletButton";
import { listAgents, type MarketAgent } from "./api/agents";
import { currentAccount, watchAccounts } from "./web3/injected";
import { fetchChainConfig } from "./api/chain";
import { IdentityBadge } from "./components/IdentityBadge";
import { listTasks, type TaskSummary } from "./api/tasks";

type Section = "overview" | "agents" | "tasks" | "settlement";

const navigation: Array<{ id: Section; label: string; icon: string }> = [
  { id: "overview", label: "工作台", icon: "⌂" },
  { id: "agents", label: "Agent 市场", icon: "✦" },
  { id: "tasks", label: "我的任务", icon: "▣" },
  { id: "settlement", label: "结算与质押", icon: "◈" },
];

function App() {
  const [section, setSection] = useState<Section>("overview");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [agents, setAgents] = useState<MarketAgent[]>([]);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [arbiter, setArbiter] = useState<string | null>(null);
  const sectionLabel = navigation.find((item) => item.id === section)?.label;

  const reloadTasks = useCallback(() => {
    setIsLoadingTasks(true);
    setTasksError(null);
    listTasks()
      .then(setTasks)
      .catch((cause) => setTasksError(cause instanceof Error ? cause.message : "任务列表读取失败"))
      .finally(() => setIsLoadingTasks(false));
  }, []);

  useEffect(reloadTasks, [reloadTasks]);

  // The connected account is the identity everything else is derived from, so it has to survive
  // a reload and follow MetaMask's own account switching.
  useEffect(() => {
    currentAccount().then(setWalletAddress).catch(() => setWalletAddress(null));
    return watchAccounts(setWalletAddress);
  }, []);

  useEffect(() => {
    fetchChainConfig()
      .then((config) => setArbiter(config.arbiter))
      .catch(() => setArbiter(null));
  }, []);

  useEffect(() => {
    listAgents()
      .then(setAgents)
      .catch((cause) => setAgentsError(cause instanceof Error ? cause.message : "Agent 目录读取失败"))
      .finally(() => setIsLoadingAgents(false));
  }, []);

  // Recommendations follow the newest task; the default keeps the panel useful before any exists.
  const recommendCategory = tasks[0]?.category ?? "研究分析";

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
              推荐引擎已接入
            </div>
            <p className="engine-status__copy">当前排序只启用完成率与质量分，向量检索和 CTR 模型待数据接入。</p>
          </div>
        </aside>

        <main className="main-content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AGENT COORDINATION LAYER</p>
              <h1>{section === "overview" ? "早上好，开始分发今天的任务" : sectionLabel}</h1>
            </div>
            <div className="topbar__identity">
              <IdentityBadge account={walletAddress} arbiter={arbiter} tasks={tasks} />
              <WalletButton
                address={walletAddress}
                onConnected={setWalletAddress}
                onDisconnected={() => setWalletAddress(null)}
              />
            </div>
          </header>

          {section === "tasks" ? (
            <MyTasks
              account={walletAddress}
              arbiter={arbiter}
              error={tasksError}
              isLoading={isLoadingTasks}
              onChanged={reloadTasks}
              tasks={tasks}
            />
          ) : section === "agents" ? (
            <AgentMarket agents={agents} error={agentsError} isLoading={isLoadingAgents} />
          ) : section === "settlement" ? (
            <SettlementPanel
              account={walletAddress}
              arbiter={arbiter}
              error={tasksError}
              isLoading={isLoadingTasks}
              onChanged={reloadTasks}
              tasks={tasks}
            />
          ) : (
            <>
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

            <MarketStats agents={agents} tasks={tasks} />

            <section className="dashboard-grid">
              <AgentRecommendations
                category={recommendCategory}
                onBrowseAll={() => setSection("agents")}
              />

              <TaskPipeline
                error={tasksError}
                isLoading={isLoadingTasks}
                onPublish={() => setSection("tasks")}
                tasks={tasks}
              />
            </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;

