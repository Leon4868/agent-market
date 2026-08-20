import { roleOf } from "../roles";
import { shortenAddress } from "../web3/injected";
import type { TaskSummary } from "../api/tasks";

type IdentityBadgeProps = {
  account: string | null;
  arbiter: string | null;
  tasks: TaskSummary[];
};

/// Answers "who am I right now" at the app level. Per-task chips only show up once you are
/// already looking at a task, which leaves every other screen silent about the connected role.
export function IdentityBadge({ account, arbiter, tasks }: IdentityBadgeProps) {
  if (!account) {
    return <p className="identity identity--empty">未连接钱包 · 角色未知</p>;
  }

  const isArbiter = Boolean(arbiter && account.toLowerCase() === arbiter.toLowerCase());
  // Only tasks that reached the chain carry a role. A draft has no escrow and no counterparty,
  // which is the same line actionsFor draws when it offers nothing without a chainTaskId.
  const live = tasks.filter((task) => task.chainTaskId !== undefined);
  const asRequester = live.filter((task) => roleOf(task, account, null) === "requester").length;
  const asAgent = live.filter((task) => roleOf(task, account, null) === "agent").length;

  const roles: string[] = [];
  if (asRequester > 0) roles.push(`需求方 ×${asRequester}`);
  if (asAgent > 0) roles.push(`接单 Agent ×${asAgent}`);
  if (isArbiter) roles.push("仲裁人");

  return (
    <p className="identity">
      <span className="mono identity__address">{shortenAddress(account)}</span>
      {roles.length > 0 ? (
        roles.map((role) => (
          <span className="identity__role" key={role}>
            {role}
          </span>
        ))
      ) : (
        <span className="identity__role identity__role--none">尚无任务角色</span>
      )}
    </p>
  );
}
