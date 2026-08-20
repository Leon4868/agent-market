import { useState } from "react";

import { actionsFor, roleLabels, roleOf, type AvailableAction } from "../roles";
import { sendEscrowAction, waitForEscrowReceipt } from "../web3/escrow";
import { confirmChainTransaction, type TaskSummary } from "../api/tasks";
import type { Address } from "viem";

type TaskActionsProps = {
  task: TaskSummary;
  account: string | null;
  arbiter: string | null;
  onSettled: () => void;
};

export function TaskActions({ task, account, arbiter, onSettled }: TaskActionsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const role = roleOf(task, account, arbiter);
  const actions = actionsFor(task, account, arbiter, Date.now());

  async function run(available: AvailableAction) {
    const key = `${available.action}:${available.favorAgent}`;
    setBusy(key);
    setError(null);
    setDone(null);

    try {
      const hash = await sendEscrowAction({
        account: account as Address,
        action: available.action,
        chainTaskId: task.chainTaskId as string,
        stakeWei: available.stakeWei,
        favorAgent: available.favorAgent,
      });
      await waitForEscrowReceipt(hash);
      // The server re-reads the same transaction from the chain before it records anything.
      await confirmChainTransaction(task.id, {
        action: available.action,
        chainId: task.budget.chainId,
        transactionHash: hash,
      });
      setDone(`${available.label}已完成`);
      onSettled();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "链上操作失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="task-actions">
      <span className={`role-chip role-chip--${role}`}>{roleLabels[role]}</span>

      {actions.map((available) => {
        const key = `${available.action}:${available.favorAgent}`;
        return (
          <button
            className={`button button--small ${available.danger ? "button--danger" : "button--primary"}`}
            disabled={busy !== null}
            key={key}
            onClick={() => run(available)}
            title={available.hint}
            type="button"
          >
            {busy === key ? "等待链上确认…" : available.label}
          </button>
        );
      })}

      {actions.length === 0 && account ? (
        <span className="task-actions__idle">当前状态下你没有可执行的操作</span>
      ) : null}

      {done ? <span className="task-actions__ok">{done}</span> : null}
      {error ? <span className="task-actions__error">{error}</span> : null}
    </div>
  );
}
