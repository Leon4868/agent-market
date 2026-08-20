import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  keccak256,
  stringToHex,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";

import { escrowAbi } from "./escrowAbi";

const chainId = Number(import.meta.env.VITE_CHAIN_ID);
const escrowAddress = import.meta.env.VITE_ESCROW_CONTRACT_ADDRESS as Address | "";

/// Reports why on-chain actions are unavailable, so the UI can disable them with a reason
/// instead of failing at signing time.
export function escrowUnavailableReason(): string | null {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return "VITE_CHAIN_ID 未配置，无法确定目标链";
  }
  if (!escrowAddress) {
    return "VITE_ESCROW_CONTRACT_ADDRESS 未配置，合约地址未知";
  }
  return null;
}

const chain = defineChain({
  id: chainId,
  name: `chain-${chainId}`,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  // Every call rides the injected provider, so no RPC URL of our own is needed.
  rpcUrls: { default: { http: [] } },
});

function provider() {
  if (!window.ethereum) {
    throw new Error("未检测到 MetaMask，请先安装浏览器钱包。");
  }
  return custom(window.ethereum);
}

async function requireChain() {
  const walletChainId = await window.ethereum?.request({ method: "eth_chainId" });
  if (typeof walletChainId === "string" && Number.parseInt(walletChainId, 16) !== chainId) {
    throw new Error(
      `钱包当前网络不是目标链（chainId ${chainId}），请在 MetaMask 中切换后重试。`,
    );
  }
}

/// Derives the on-chain identifier from the off-chain task id. The chain stores only this hash,
/// which is what keeps task text off-chain (see docs/architecture.md).
export function toExternalTaskId(taskId: string) {
  return keccak256(stringToHex(taskId));
}

export async function lockTaskBudget(input: {
  account: Address;
  taskId: string;
  deadline: Date;
  budgetWei: bigint;
}): Promise<Hash> {
  const unavailable = escrowUnavailableReason();
  if (unavailable) throw new Error(unavailable);
  await requireChain();

  const wallet = createWalletClient({ account: input.account, chain, transport: provider() });
  return wallet.writeContract({
    address: escrowAddress as Address,
    abi: escrowAbi,
    functionName: "createTask",
    args: [toExternalTaskId(input.taskId), BigInt(Math.floor(input.deadline.getTime() / 1000))],
    value: input.budgetWei,
  });
}

export async function waitForEscrowReceipt(hash: Hash): Promise<TransactionReceipt> {
  const publicClient = createPublicClient({ chain, transport: provider() });
  return publicClient.waitForTransactionReceipt({ hash });
}

/// D1: the Agent alone stakes 6% of the budget. Mirrors STAKE_BPS in AgentTaskEscrow.sol; the
/// contract stays the authority, this is only for showing the number before anyone signs.
const STAKE_BPS = 600n;

export function stakeFor(budgetWei: string | bigint): bigint {
  const budget = typeof budgetWei === "bigint" ? budgetWei : BigInt(budgetWei);
  return (budget * STAKE_BPS) / 10_000n;
}

/// The write actions the lifecycle needs, past creation. Grouped in one place so the ABI, the
/// value rule and the argument shape for each action are visible side by side.
export type EscrowAction =
  | "ACCEPT_TASK"
  | "SUBMIT_TASK"
  | "APPROVE_TASK"
  | "DISPUTE_TASK"
  | "RESOLVE_DISPUTE"
  | "CLAIM_REVIEW_TIMEOUT"
  | "CLAIM_DELIVERY_TIMEOUT"
  | "CANCEL_TASK";

const escrowFunctions = {
  ACCEPT_TASK: "acceptTask",
  SUBMIT_TASK: "submitTask",
  APPROVE_TASK: "approveTask",
  DISPUTE_TASK: "disputeTask",
  RESOLVE_DISPUTE: "resolveDispute",
  CLAIM_REVIEW_TIMEOUT: "claimReviewTimeout",
  CLAIM_DELIVERY_TIMEOUT: "claimDeliveryTimeout",
  CANCEL_TASK: "cancelTask",
} as const;

export async function sendEscrowAction(input: {
  account: Address;
  action: EscrowAction;
  chainTaskId: string;
  /// Only ACCEPT_TASK moves value: the Agent's 6% stake.
  stakeWei?: bigint;
  /// Only RESOLVE_DISPUTE carries a verdict.
  favorAgent?: boolean;
}): Promise<Hash> {
  const unavailable = escrowUnavailableReason();
  if (unavailable) throw new Error(unavailable);
  await requireChain();

  const wallet = createWalletClient({ account: input.account, chain, transport: provider() });
  const taskId = BigInt(input.chainTaskId);

  // The two actions with a payload are spelled out because their signatures differ: only
  // acceptTask is payable, and only resolveDispute carries a second argument.
  if (input.action === "RESOLVE_DISPUTE") {
    return wallet.writeContract({
      address: escrowAddress as Address,
      abi: escrowAbi,
      functionName: "resolveDispute",
      args: [taskId, input.favorAgent === true],
    });
  }

  if (input.action === "ACCEPT_TASK") {
    return wallet.writeContract({
      address: escrowAddress as Address,
      abi: escrowAbi,
      functionName: "acceptTask",
      args: [taskId],
      value: input.stakeWei,
    });
  }

  return wallet.writeContract({
    address: escrowAddress as Address,
    abi: escrowAbi,
    functionName: escrowFunctions[input.action],
    args: [taskId],
  });
}
