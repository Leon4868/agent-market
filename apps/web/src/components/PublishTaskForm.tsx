import { useState } from "react";

import { parseEther, type Address } from "viem";

import { confirmChainTransaction, createDraftTask } from "../api/tasks";
import { escrowUnavailableReason, lockTaskBudget, waitForEscrowReceipt } from "../web3/escrow";

const categories = ["研究分析", "合约审查", "增长策略"];
const chainId = Number(import.meta.env.VITE_CHAIN_ID);

// Each step is a place the flow can stop, so the UI can say which one the user is waiting on.
type Stage = "idle" | "drafting" | "signing" | "confirming" | "recording" | "done";

const stageCopy: Record<Exclude<Stage, "idle" | "done">, string> = {
  drafting: "正在校验任务并创建草稿…",
  signing: "请在 MetaMask 中签名，确认锁定预算…",
  confirming: "交易已广播，等待区块确认…",
  recording: "正在由服务端复核链上交易…",
};

function splitList(value: string) {
  return value
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type PublishTaskFormProps = {
  walletAddress: string | null;
  onPublished: () => void;
};

export function PublishTaskForm({ walletAddress, onPublished }: PublishTaskFormProps) {
  const [title, setTitle] = useState("审查托管合约的状态机与资金安全");
  const [category, setCategory] = useState(categories[1]);
  const [description, setDescription] = useState(
    "检查任务状态转移与资金释放路径，重点核对争议分账与两个超时时钟，输出可执行的修复建议。",
  );
  const [tags, setTags] = useState("solidity, security");
  const [expertise, setExpertise] = useState("evm");
  const [budget, setBudget] = useState("1.0");
  const [deadline, setDeadline] = useState("");

  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ taskId: string; txHash: string } | null>(null);

  const configError = escrowUnavailableReason();
  const blocked = configError ?? (walletAddress ? null : "请先连接 MetaMask 再发布任务");
  const isBusy = stage !== "idle" && stage !== "done";

  // A draft has to exist before signing, because the chain stores keccak256(taskId). When signing
  // then fails, that draft is already saved — creating another on every retry leaves a trail of
  // orphans. The draft belongs to the form content that produced it, so it is reused until that
  // content changes (the server re-checks budget against the chain, so a stale one must not be).
  const [pendingDraft, setPendingDraft] = useState<{ id: string; signature: string } | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (blocked) return;

    setError(null);
    setResult(null);

    let budgetWei: bigint;
    let deadlineAt: Date;
    try {
      budgetWei = parseEther(budget.trim());
      deadlineAt = new Date(deadline);
      if (Number.isNaN(deadlineAt.getTime())) throw new Error("完成时间点格式不正确");
      if (budgetWei <= 0n) throw new Error("预算必须大于 0");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "预算或时间填写有误");
      return;
    }

    const draftInput = {
      title: title.trim(),
      category,
      description: description.trim(),
      tags: splitList(tags),
      expertise: splitList(expertise),
      budget: { chainId, asset: "native" as const, amount: budgetWei.toString() },
      deadline: deadlineAt.toISOString(),
      requesterWallet: walletAddress as string,
    };
    const signature = JSON.stringify(draftInput);

    try {
      // The draft is created off-chain first so the chain only ever stores a hash of its id.
      setStage("drafting");
      const draft =
        pendingDraft?.signature === signature
          ? { id: pendingDraft.id }
          : await createDraftTask(draftInput);
      setPendingDraft({ id: draft.id, signature });

      setStage("signing");
      const txHash = await lockTaskBudget({
        account: walletAddress as Address,
        taskId: draft.id,
        deadline: deadlineAt,
        budgetWei,
      });

      setStage("confirming");
      const receipt = await waitForEscrowReceipt(txHash);
      if (receipt.status !== "success") throw new Error("交易已上链但执行失败");

      // The server re-reads the transaction from the chain; only it may move the task out of
      // DRAFT, so the UI does not claim success until that call returns.
      setStage("recording");
      await confirmChainTransaction(draft.id, { action: "CREATE_ESCROW", chainId, transactionHash: txHash });

      setPendingDraft(null);
      setResult({ taskId: draft.id, txHash });
      setStage("done");
      onPublished();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发布任务失败");
      setStage("idle");
    }
  }

  return (
    <form className="panel content-panel publish-form" onSubmit={handleSubmit}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">PUBLISH TASK</p>
          <h3>发布新任务</h3>
        </div>
      </div>

      <label className="field">
        <span>任务标题</span>
        <input onChange={(event) => setTitle(event.target.value)} required value={title} />
      </label>

      <div className="field-row">
        <label className="field">
          <span>任务分类</span>
          <select onChange={(event) => setCategory(event.target.value)} value={category}>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="field">
          <span>专家类型</span>
          <input onChange={(event) => setExpertise(event.target.value)} value={expertise} />
        </label>
      </div>

      <label className="field">
        <span>任务描述</span>
        <textarea
          onChange={(event) => setDescription(event.target.value)}
          required
          rows={4}
          value={description}
        />
      </label>

      <label className="field">
        <span>技能标签</span>
        <input onChange={(event) => setTags(event.target.value)} required value={tags} />
      </label>

      <div className="field-row">
        <label className="field">
          <span>预算出价（ETH）</span>
          <input onChange={(event) => setBudget(event.target.value)} required value={budget} />
        </label>
        <label className="field">
          <span>完成时间点</span>
          <input
            onChange={(event) => setDeadline(event.target.value)}
            required
            type="datetime-local"
            value={deadline}
          />
        </label>
      </div>

      <div className="escrow-preview">
        <p>发布即锁仓，本次将发生：</p>
        <ul>
          <li>{`锁定 ${budget || "0"} ETH 进入托管合约`}</li>
          <li>Agent 接单时另存预算 6% 的保证金</li>
          <li>验收通过后，Agent 获得预算 + 退还的保证金</li>
          <li>若 Agent 逾期未交付，你可取回全部预算，其保证金原路退还</li>
        </ul>
      </div>

      <button className="button button--primary" disabled={Boolean(blocked) || isBusy} type="submit">
        {isBusy ? "处理中…" : "连接合约并锁定预算"}
      </button>
      <p className="form-hint">{`将调用 AgentTaskEscrow.createTask（chainId ${chainId}），需要你在钱包中签名一笔交易`}</p>

      {blocked ? <p className="state-note">{blocked}</p> : null}
      {isBusy ? <p className="state-note">{stageCopy[stage as keyof typeof stageCopy]}</p> : null}
      {error ? <p className="state-note state-note--error">{error}</p> : null}
      {result ? (
        <div className="state-note state-note--ok">
          <p>{`任务已上链：${result.taskId}`}</p>
          <p className="mono">{result.txHash}</p>
        </div>
      ) : null}
    </form>
  );
}
