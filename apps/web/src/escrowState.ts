/// Where the money physically is for each task status, and whether the escrow contract is still
/// holding it. Mirrors the state machine in AgentTaskEscrow.sol.
const fundState: Record<string, { where: string; held: boolean; staked: boolean }> = {
  DRAFT: { where: "尚未上链", held: false, staked: false },
  PUBLISHED: { where: "托管合约 · 等待 Agent 接单", held: true, staked: false },
  MATCHING: { where: "托管合约 · 撮合中", held: true, staked: false },
  ASSIGNED: { where: "托管合约 · 已接单", held: true, staked: true },
  IN_PROGRESS: { where: "托管合约 · 交付中", held: true, staked: true },
  SUBMITTED: { where: "托管合约 · 7 天验收窗口", held: true, staked: true },
  DISPUTED: { where: "托管合约 · 等待仲裁人", held: true, staked: true },
  COMPLETED: { where: "已放款给 Agent（含质押退还）", held: false, staked: true },
  SETTLED: { where: "已放款给 Agent（含质押退还）", held: false, staked: true },
  RESOLVED: { where: "已按裁决分账", held: false, staked: true },
  CANCELLED: { where: "已退款给需求方，质押退还 Agent", held: false, staked: true },
};

const unknown = { where: "状态未知", held: false, staked: false };

export function fundsOf(status: string) {
  return fundState[status] ?? unknown;
}
