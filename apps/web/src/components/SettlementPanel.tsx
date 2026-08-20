import { TaskActions } from "./TaskActions";
import { formatEth } from "../format";
import { fundsOf } from "../escrowState";
import { stakeFor } from "../web3/escrow";
import type { TaskSummary } from "../api/tasks";

type SettlementPanelProps = {
  tasks: TaskSummary[];
  account: string | null;
  arbiter: string | null;
  error: string | null;
  isLoading: boolean;
  onChanged: () => void;
};

export function SettlementPanel({
  tasks,
  account,
  arbiter,
  error,
  isLoading,
  onChanged,
}: SettlementPanelProps) {
  const disputed = tasks.filter((task) => task.status === "DISPUTED");
  const isArbiter = Boolean(
    account && arbiter && account.toLowerCase() === arbiter.toLowerCase(),
  );
  const onChain = tasks.filter((task) => task.chainTaskId !== undefined);
  const escrowed = onChain.filter((task) => fundsOf(task.status).held);

  const heldTotal = escrowed.reduce((sum, task) => sum + BigInt(task.budget.amount), 0n);
  const stakeTotal = escrowed.reduce((sum, task) => sum + stakeFor(task.budget.amount), 0n);

  return (
    <div className="panel content-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ESCROW &amp; STAKE</p>
          <h3>结算与质押</h3>
        </div>
        <span className="count-badge">{`${escrowed.length} 笔托管中`}</span>
      </div>

      <p className="panel-note">
        D1：Agent 单边质押预算的 6%，需求方不押保证金，平台不抽成。D5b：质押是保证金不是罚金，
        争议判给需求方时 Agent 仍拿回质押。
      </p>

      <div className="settlement-summary">
        <div>
          <strong>{formatEth(heldTotal)}</strong>
          <span>托管合约持有</span>
        </div>
        <div>
          <strong>{formatEth(stakeTotal)}</strong>
          <span>对应质押要求（6%）</span>
        </div>
        <div>
          <strong>{onChain.length}</strong>
          <span>已上链任务</span>
        </div>
        <div>
          <strong>{arbiter ? `${arbiter.slice(0, 6)}…${arbiter.slice(-4)}` : "—"}</strong>
          <span>{isArbiter ? "仲裁人（就是你）" : "当前仲裁人"}</span>
        </div>
      </div>

      {isLoading ? <p className="state-note">正在读取任务资金状态…</p> : null}
      {error ? <p className="state-note state-note--error">{error}</p> : null}
      {!isLoading && !error && onChain.length === 0 ? (
        <p className="state-note">还没有任务完成链上锁仓。发布任务并签名后，资金流向会显示在这里。</p>
      ) : null}

      {disputed.length > 0 ? (
        <div className="dispute-queue">
          <p className="dispute-queue__title">
            {isArbiter
              ? `待你裁决的争议（${disputed.length}）`
              : `争议中的任务（${disputed.length}）· 只有仲裁人能裁决`}
          </p>
          {disputed.map((task) => (
            <article className="settlement-row" key={task.id}>
              <div className="settlement-row__main">
                <h4>{task.title}</h4>
                <p className="settlement-row__chain mono">{`链上任务 #${task.chainTaskId}`}</p>
                <TaskActions
                  account={account}
                  arbiter={arbiter}
                  onSettled={onChanged}
                  task={task}
                />
              </div>
              <div className="settlement-row__amounts">
                <div>
                  <strong>{formatEth(task.budget.amount)}</strong>
                  <span>争议金额</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <div className="settlement-list">
        {onChain.map((task) => {
          const state = fundsOf(task.status);
          const stake = stakeFor(task.budget.amount);

          return (
            <article className="settlement-row" key={task.id}>
              <div className="settlement-row__main">
                <h4>{task.title}</h4>
                <p className={`settlement-row__where ${state.held ? "" : "settlement-row__where--released"}`}>
                  {state.where}
                </p>
                <p className="settlement-row__chain mono">
                  {`链上任务 #${task.chainTaskId} · ${task.transactionHash?.slice(0, 18)}…`}
                </p>
              </div>
              <div className="settlement-row__amounts">
                <div>
                  <strong>{formatEth(task.budget.amount)}</strong>
                  <span>预算</span>
                </div>
                <div>
                  <strong>{formatEth(stake)}</strong>
                  <span>{state.staked ? "已质押" : "待质押"}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>

    </div>
  );
}
