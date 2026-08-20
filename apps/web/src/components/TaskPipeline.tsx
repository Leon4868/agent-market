import { formatEth } from "../format";
import { statusLabels } from "../taskStatus";
import type { TaskSummary } from "../api/tasks";

const progressClass: Record<string, string> = {
  DRAFT: "task-progress__bar--matching",
  PUBLISHED: "task-progress__bar--matching",
  MATCHING: "task-progress__bar--matching",
  ASSIGNED: "task-progress__bar--active",
  IN_PROGRESS: "task-progress__bar--active",
  SUBMITTED: "task-progress__bar--review",
};

type TaskPipelineProps = {
  tasks: TaskSummary[];
  error: string | null;
  isLoading: boolean;
  onPublish: () => void;
};

export function TaskPipeline({ tasks, error, isLoading, onPublish }: TaskPipelineProps) {
  const active = tasks.filter((task) => task.status !== "CANCELLED" && task.status !== "SETTLED");

  return (
    <div className="panel content-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">TASK PIPELINE</p>
          <h3>任务进度</h3>
        </div>
        <span className="count-badge">{`${active.length} 个进行中`}</span>
      </div>

      {isLoading ? <p className="state-note">正在读取任务列表…</p> : null}
      {error ? <p className="state-note state-note--error">{error}</p> : null}
      {!isLoading && !error && tasks.length === 0 ? (
        <p className="state-note">还没有任务。发布一个任务并完成链上锁仓后，它会出现在这里。</p>
      ) : null}

      <div className="task-list">
        {tasks.map((task) => (
          <article className="task-card" key={task.id}>
            <div className="task-card__heading">
              <div>
                <h4>{task.title}</h4>
                <p>{`${task.category} · ${new Date(task.deadline).toLocaleString("zh-CN")}`}</p>
              </div>
              <strong>{formatEth(task.budget.amount)}</strong>
            </div>
            <div className="task-progress">
              <span className={progressClass[task.status] ?? "task-progress__bar--matching"} />
            </div>
            <p className="task-card__status">
              {statusLabels[task.status] ?? task.status}
              {task.chainTaskId ? ` · 链上 #${task.chainTaskId}` : ""}
            </p>
          </article>
        ))}
      </div>

      <button className="button button--wide" onClick={onPublish} type="button">发布新任务</button>
    </div>
  );
}
