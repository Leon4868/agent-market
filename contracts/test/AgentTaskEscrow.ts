import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { keccak256, parseEther, stringToHex, type Address, type Hex } from "viem";

type TaskRecord = readonly [
  externalTaskId: Hex,
  requester: Address,
  agent: Address,
  budget: bigint,
  stake: bigint,
  deadline: bigint,
  status: number,
];

describe("AgentTaskEscrow", async function () {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [requester, agent, arbiter] = await viem.getWalletClients();

  async function deploy() {
    return viem.deployContract("AgentTaskEscrow", [arbiter.account.address]);
  }

  function deadline() {
    return BigInt(Math.floor(Date.now() / 1000) + 3_600);
  }

  it("creates, accepts, submits, and approves a task", async function () {
    const escrow = await deploy();
    const budget = parseEther("1");
    const stake = parseEther("0.06");

    await escrow.write.createTask([keccak256(stringToHex("task-1")), deadline()], { value: budget, account: requester.account });
    await escrow.write.acceptTask([0n], { value: stake, account: agent.account });
    await escrow.write.submitTask([0n], { account: agent.account });
    await escrow.write.approveTask([0n], { account: requester.account });

    const task = (await escrow.read.tasks([0n])) as TaskRecord;
    assert.equal(task[6], 3);
    assert.equal(task[2].toLowerCase(), agent.account.address.toLowerCase());
    assert.equal(await publicClient.getBlockNumber() > 0n, true);
  });

  it("rejects a stake that is not exactly 6% of the budget", async function () {
    const escrow = await deploy();
    const budget = parseEther("1");

    await escrow.write.createTask([keccak256(stringToHex("task-2")), deadline()], { value: budget, account: requester.account });
    await assert.rejects(() => escrow.write.acceptTask([0n], { value: parseEther("0.05"), account: agent.account }));
  });

  it("refunds an unaccepted task", async function () {
    const escrow = await deploy();
    await escrow.write.createTask([keccak256(stringToHex("task-3")), deadline()], { value: parseEther("0.2"), account: requester.account });
    await escrow.write.cancelTask([0n], { account: requester.account });

    const task = (await escrow.read.tasks([0n])) as TaskRecord;
    assert.equal(task[6], 5);
  });

  it("allows the owner to resolve a dispute", async function () {
    const escrow = await deploy();
    await escrow.write.createTask([keccak256(stringToHex("task-4")), deadline()], { value: parseEther("1"), account: requester.account });
    await escrow.write.acceptTask([0n], { value: parseEther("0.06"), account: agent.account });
    await escrow.write.submitTask([0n], { account: agent.account });
    await escrow.write.disputeTask([0n], { account: requester.account });
    await escrow.write.resolveDispute([0n, false], { account: arbiter.account });

    const task = (await escrow.read.tasks([0n])) as TaskRecord;
    assert.equal(task[6], 5);
  });
});
