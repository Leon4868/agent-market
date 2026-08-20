// api-contract.md is explicit that a broadcast transaction reported by the client proves nothing.
// Every field the business logic depends on is re-read from the chain here: the target contract,
// the event, the task id, and whatever the action itself carries (payer, amount, agent, verdict).
import {
  createPublicClient,
  decodeEventLog,
  http,
  keccak256,
  stringToHex,
  type Hash,
} from "viem";

import { escrowFragments } from "./escrowFragments.js";
import { escrowActions, type EscrowAction } from "./taskFlow.js";
import type { StoredTask } from "./store.js";

const rpcUrl = process.env.CHAIN_RPC_URL ?? "http://127.0.0.1:8545";
const escrowAddress = (process.env.ESCROW_CONTRACT_ADDRESS ?? "").toLowerCase();

/// What the chain told us. Only the fields the action actually produces are set.
export type EscrowFacts = {
  chainTaskId: string;
  /// Who actually sent the transaction. Read from the receipt, not inferred from the action, so
  /// the audit trail records the real caller even when several roles can trigger the same step.
  caller: string;
  agentWallet?: string;
  favorAgent?: boolean;
};

/// The escrow's public configuration. Served to the client so role display works before — and
/// without — a wallet: who may arbitrate is a fact about the system, not about the visitor.
export async function readEscrowConfig(): Promise<{
  escrowAddress: string | null;
  arbiter: string | null;
}> {
  if (!escrowAddress) return { escrowAddress: null, arbiter: null };

  const client = createPublicClient({ transport: http(rpcUrl) });
  try {
    const arbiter = await client.readContract({
      address: escrowAddress as `0x${string}`,
      abi: escrowFragments,
      functionName: "arbiter",
    });
    return { escrowAddress, arbiter };
  } catch {
    return { escrowAddress, arbiter: null };
  }
}

export type EscrowCheck =
  | { ok: true; facts: EscrowFacts }
  | { ok: false; code: string; message: string };

function reject(code: string, message: string): EscrowCheck {
  return { ok: false, code, message };
}

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

export async function verifyEscrowAction(input: {
  action: EscrowAction;
  transactionHash: Hash;
  task: StoredTask;
}): Promise<EscrowCheck> {
  if (!escrowAddress) {
    return reject("CHAIN_NOT_CONFIGURED", "ESCROW_CONTRACT_ADDRESS 未配置，无法校验交易");
  }

  const client = createPublicClient({ transport: http(rpcUrl) });

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: input.transactionHash });
  } catch {
    return reject("CHAIN_RECEIPT_NOT_FOUND", "链上找不到该交易，或节点不可用");
  }

  if (receipt.status !== "success") {
    return reject("CHAIN_TX_REVERTED", "该交易在链上执行失败");
  }
  if (!receipt.to || !sameAddress(receipt.to, escrowAddress)) {
    return reject("CHAIN_WRONG_CONTRACT", "该交易的目标地址不是托管合约");
  }

  const expectedEvent = escrowActions[input.action].event;

  for (const log of receipt.logs) {
    if (!sameAddress(log.address, escrowAddress)) continue;

    let decoded;
    try {
      decoded = decodeEventLog({ abi: escrowFragments, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (decoded.eventName !== expectedEvent) continue;

    const check = inspect(input, decoded, receipt.from);
    if (check) return check;
  }

  return reject("CHAIN_EVENT_MISSING", `该交易没有产生托管合约的 ${expectedEvent} 事件`);
}

type DecodedEvent = ReturnType<typeof decodeEventLog<typeof escrowFragments>>;

/// Returns the verdict for one matching event, or null to keep scanning the remaining logs — a
/// single transaction can emit several events of interest when actions are batched.
function inspect(
  input: { action: EscrowAction; task: StoredTask },
  decoded: DecodedEvent,
  caller: string,
): EscrowCheck | null {
  const { task } = input;

  if (input.action === "CREATE_ESCROW") {
    if (decoded.eventName !== "TaskCreated") return null;
    const { taskId, externalTaskId, requester, budget } = decoded.args;

    if (externalTaskId !== keccak256(stringToHex(task.id))) {
      return reject("CHAIN_TASK_MISMATCH", "链上事件对应的不是这个任务");
    }
    if (!sameAddress(requester, task.requesterWallet)) {
      return reject("CHAIN_REQUESTER_MISMATCH", "链上付款地址与任务发布方不一致");
    }
    if (budget !== BigInt(task.budget.amount)) {
      return reject("CHAIN_BUDGET_MISMATCH", "链上锁定金额与任务预算不一致");
    }
    return { ok: true, facts: { chainTaskId: taskId.toString(), caller } };
  }

  // Every later action targets a task that is already on chain, so the binding to check is the
  // on-chain id. Without it any escrow transaction could be replayed against any task.
  const eventTaskId = (decoded.args as { taskId: bigint }).taskId.toString();
  if (task.chainTaskId === undefined || eventTaskId !== task.chainTaskId) {
    return reject("CHAIN_TASK_MISMATCH", "链上事件对应的不是这个任务");
  }

  if (decoded.eventName === "TaskAccepted") {
    return { ok: true, facts: { chainTaskId: eventTaskId, caller, agentWallet: decoded.args.agent } };
  }

  if (decoded.eventName === "TaskCompleted") {
    // Both approval and the 7-day auto-settlement emit TaskCompleted. Telling them apart keeps
    // the record honest: D2 reads a manual approval as a quality signal, a timeout is not one.
    const autoApproved = decoded.args.autoApproved;
    const claimed = input.action === "CLAIM_REVIEW_TIMEOUT";
    if (autoApproved !== claimed) {
      return reject(
        "CHAIN_SETTLEMENT_MISMATCH",
        autoApproved ? "该交易是验收超时自动结算，不是需求方主动验收" : "该交易是需求方主动验收，不是超时结算",
      );
    }
    return { ok: true, facts: { chainTaskId: eventTaskId, caller } };
  }

  if (decoded.eventName === "DisputeResolved") {
    return { ok: true, facts: { chainTaskId: eventTaskId, caller, favorAgent: decoded.args.favorAgent } };
  }

  return { ok: true, facts: { chainTaskId: eventTaskId, caller } };
}
