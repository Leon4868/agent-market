import { useState } from "react";

import { PublishTaskForm } from "./PublishTaskForm";
import { TaskActions } from "./TaskActions";
import { formatEth } from "../format";
import { fundsOf } from "../escrowState";
import { roleOf } from "../roles";
import { statusLabels } from "../taskStatus";
import type { TaskSummary } from "../api/tasks";

type MyTasksProps = {
  tasks: TaskSummary[];
  account: string | null;
  arbiter: string | null;
  error: string | null;
  isLoading: boolean;
  onChanged: () => void;
};

export function MyTasks({ tasks, account, arbiter, error, isLoading, onChanged }: MyTasksProps) {
  const [onlyMine, setOnlyMine] = useState(true);

  const mine = tasks.filter((task) => roleOf(task, account, arbiter) !== "observer");
  const visible = onlyMine && account ? mine : tasks;

  return (
    <>
      <PublishTaskForm onPublished={onChanged} walletAddress={account} />

      <div className="panel content-panel task-board">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TASK LIFECYCLE</p>
            <h3>任务与可执行操作</h3>
          </div>
          <button
            className="text-button"
            onClick={() => setOnlyMine((value) => !value)}
            type="button"
          >
            {onlyMine ? `显示全部（${tasks.length}）` : `只看与我有关（${mine.length}）`}
          </button>
        </div>

        <p className="panel-note">
          角色由当前连接的账号推导，不是选出来的：在 MetaMask 里换账号，这里的角色和按钮会跟着变。
          按钮只是入口，真正的权限由合约的 msg.sender 判断。
        </p>

        {isLoading ? <p className="state-note">正在读取任务…</p> : null}
        {error ? <p className="state-note state-note--error">{error}</p> : null}
        {!account ? (
          <p className="state-note">连接钱包后才能看出你在每个任务里的角色。</p>
        ) : null}
        {!isLoading && !error && account && visible.length === 0 ? (
          <p className="state-note">
            {onlyMine ? "还没有与当前账号相关的任务。切换账号或发布一个任务试试。" : "还没有任务。"}
          </p>
        ) : null}

        <div className="settlement-list">
          {visible.map((task) => (
            <article className="settlement-row" key={task.id}>
              <div className="settlement-row__main">
                <h4>{task.title}</h4>
                <p className="settlement-row__where">
                  {`${statusLabels[task.status] ?? task.status} · ${fundsOf(task.status).where}`}
                </p>
                {task.chainTaskId === undefined ? (
                  <p className="settlement-row__chain mono">尚未上链，无法执行链上操作</p>
                ) : (
                  <p className="settlement-row__chain mono">{`链上任务 #${task.chainTaskId}`}</p>
                )}
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
                  <span>预算</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
