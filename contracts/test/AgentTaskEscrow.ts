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
  submittedAt: bigint,
  status: number,
];

const OPEN = 0;
const IN_PROGRESS = 1;
const SUBMITTED = 2;
const COMPLETED = 3;
const DISPUTED = 4;
const CANCELLED = 5;

const BUDGET = parseEther("1");
const STAKE = parseEther("0.06");
const REVIEW_WINDOW = 7 * 24 * 60 * 60;

describe("AgentTaskEscrow", async function () {
  const { viem, networkHelpers } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [requester, agent, arbiter, outsider] = await viem.getWalletClients();

  async function deploy() {
    return viem.deployContract("AgentTaskEscrow", [
      requester.account.address,
      arbiter.account.address,
    ]);
  }

  // Derived from chain time, not wall-clock: the timeout tests move the chain forward and a
  // Date.now() deadline would already be in the past for every test that runs after them.
  async function deadline() {
    return BigInt(await networkHelpers.time.latest()) + 3_600n;
  }

  async function openTask(escrow: Awaited<ReturnType<typeof deploy>>, label: string) {
    await escrow.write.createTask([keccak256(stringToHex(label)), await deadline()], {
      value: BUDGET,
      account: requester.account,
    });
  }

  async function acceptedTask(escrow: Awaited<ReturnType<typeof deploy>>, label: string) {
    await openTask(escrow, label);
    await escrow.write.acceptTask([0n], { value: STAKE, account: agent.account });
  }

  async function submittedTask(escrow: Awaited<ReturnType<typeof deploy>>, label: string) {
    await acceptedTask(escrow, label);
    await escrow.write.submitTask([0n], { account: agent.account });
  }

  function readTask(escrow: Awaited<ReturnType<typeof deploy>>) {
    return escrow.read.tasks([0n]) as Promise<TaskRecord>;
  }

  it("creates, accepts, submits, and approves a task", async function () {
    const escrow = await deploy();
    await submittedTask(escrow, "task-happy-path");

    const before = await publicClient.getBalance({ address: agent.account.address });
    await escrow.write.approveTask([0n], { account: requester.account });
    const after = await publicClient.getBalance({ address: agent.account.address });

    const task = await readTask(escrow);
    assert.equal(task[7], COMPLETED);
    assert.equal(task[2].toLowerCase(), agent.account.address.toLowerCase());
    assert.equal(after - before, BUDGET + STAKE);
    assert.equal(await publicClient.getBalance({ address: escrow.address }), 0n);
  });

  it("rejects a stake that is not exactly 6% of the budget", async function () {
    const escrow = await deploy();
    await openTask(escrow, "task-wrong-stake");

    await assert.rejects(() =>
      escrow.write.acceptTask([0n], { value: parseEther("0.05"), account: agent.account }),
    );
    assert.equal((await readTask(escrow))[7], OPEN);
  });

  it("rejects accepting a task whose deadline already passed", async function () {
    const escrow = await deploy();
    await openTask(escrow, "task-expired-accept");
    await networkHelpers.time.increase(3_601);

    await assert.rejects(() =>
      escrow.write.acceptTask([0n], { value: STAKE, account: agent.account }),
    );
    assert.equal((await readTask(escrow))[7], OPEN);
  });

  it("refunds an unaccepted task", async function () {
    const escrow = await deploy();
    await openTask(escrow, "task-cancel");
    await escrow.write.cancelTask([0n], { account: requester.account });

    assert.equal((await readTask(escrow))[7], CANCELLED);
    assert.equal(await publicClient.getBalance({ address: escrow.address }), 0n);
  });

  describe("D5b 争议分账", function () {
    it("returns the stake to the Agent when the requester wins", async function () {
      const escrow = await deploy();
      await submittedTask(escrow, "task-dispute-requester");
      await escrow.write.disputeTask([0n], { account: requester.account });
      assert.equal((await readTask(escrow))[7], DISPUTED);

      const requesterBefore = await publicClient.getBalance({ address: requester.account.address });
      const agentBefore = await publicClient.getBalance({ address: agent.account.address });
      await escrow.write.resolveDispute([0n, false], { account: arbiter.account });

      const requesterAfter = await publicClient.getBalance({ address: requester.account.address });
      const agentAfter = await publicClient.getBalance({ address: agent.account.address });

      assert.equal(requesterAfter - requesterBefore, BUDGET);
      assert.equal(agentAfter - agentBefore, STAKE, "stake is a bond, not a penalty");
      assert.equal((await readTask(escrow))[7], CANCELLED);
      assert.equal(await publicClient.getBalance({ address: escrow.address }), 0n);
    });

    it("pays budget and stake to the Agent when the Agent wins", async function () {
      const escrow = await deploy();
      await submittedTask(escrow, "task-dispute-agent");
      await escrow.write.disputeTask([0n], { account: agent.account });

      const before = await publicClient.getBalance({ address: agent.account.address });
      await escrow.write.resolveDispute([0n, true], { account: arbiter.account });
      const after = await publicClient.getBalance({ address: agent.account.address });

      assert.equal(after - before, BUDGET + STAKE);
      assert.equal((await readTask(escrow))[7], COMPLETED);
    });
  });

  describe("D5a 可替换的仲裁人", function () {
    it("rejects arbitration from the owner and from outsiders", async function () {
      const escrow = await deploy();
      await submittedTask(escrow, "task-arbiter-guard");
      await escrow.write.disputeTask([0n], { account: requester.account });

      // requester is the owner here, which must not be enough to arbitrate.
      await assert.rejects(() =>
        escrow.write.resolveDispute([0n, true], { account: requester.account }),
      );
      await assert.rejects(() =>
        escrow.write.resolveDispute([0n, true], { account: outsider.account }),
      );
      assert.equal((await readTask(escrow))[7], DISPUTED);
    });

    it("lets the owner hand arbitration to another address", async function () {
      const escrow = await deploy();
      await submittedTask(escrow, "task-arbiter-rotate");
      await escrow.write.disputeTask([0n], { account: requester.account });
      await escrow.write.setArbiter([outsider.account.address], { account: requester.account });

      assert.equal(
        (await escrow.read.arbiter()).toLowerCase(),
        outsider.account.address.toLowerCase(),
      );
      await assert.rejects(() =>
        escrow.write.resolveDispute([0n, true], { account: arbiter.account }),
      );
      await escrow.write.resolveDispute([0n, true], { account: outsider.account });
      assert.equal((await readTask(escrow))[7], COMPLETED);
    });

    it("rejects a zero arbiter", async function () {
      const escrow = await deploy();
      await assert.rejects(() =>
        escrow.write.setArbiter([`0x${"0".repeat(40)}`], { account: requester.account }),
      );
    });
  });

  describe("D7 验收超时", function () {
    it("keeps the funds locked while the review window is open", async function () {
      const escrow = await deploy();
      await submittedTask(escrow, "task-review-early");
      await networkHelpers.time.increase(REVIEW_WINDOW - 60);

      await assert.rejects(() =>
        escrow.write.claimReviewTimeout([0n], { account: agent.account }),
      );
      assert.equal((await readTask(escrow))[7], SUBMITTED);
    });

    it("settles to the Agent once the requester stays silent for 7 days", async function () {
      const escrow = await deploy();
      await submittedTask(escrow, "task-review-timeout");
      await networkHelpers.time.increase(REVIEW_WINDOW + 1);

      const before = await publicClient.getBalance({ address: agent.account.address });
      // The requester pays the gas here so the Agent balance delta is exactly the payout.
      await escrow.write.claimReviewTimeout([0n], { account: requester.account });
      const after = await publicClient.getBalance({ address: agent.account.address });

      assert.equal(after - before, BUDGET + STAKE);
      assert.equal((await readTask(escrow))[7], COMPLETED);
      assert.equal(await publicClient.getBalance({ address: escrow.address }), 0n);
    });
  });

  describe("D7 交付超时", function () {
    it("keeps the task running until the deadline passes", async function () {
      const escrow = await deploy();
      await acceptedTask(escrow, "task-delivery-early");

      await assert.rejects(() =>
        escrow.write.claimDeliveryTimeout([0n], { account: requester.account }),
      );
      assert.equal((await readTask(escrow))[7], IN_PROGRESS);
    });

    it("refunds the requester and returns the stake after the deadline", async function () {
      const escrow = await deploy();
      await acceptedTask(escrow, "task-delivery-timeout");
      await networkHelpers.time.increase(3_601);

      const before = await publicClient.getBalance({ address: requester.account.address });
      // The Agent pays the gas here so the requester balance delta is exactly the refund.
      await escrow.write.claimDeliveryTimeout([0n], { account: agent.account });
      const after = await publicClient.getBalance({ address: requester.account.address });

      assert.equal(after - before, BUDGET);
      assert.equal((await readTask(escrow))[7], CANCELLED);
      // A zero contract balance proves the stake went back to the Agent too.
      assert.equal(await publicClient.getBalance({ address: escrow.address }), 0n);
    });

    it("rejects timeout claims from non-parties", async function () {
      const escrow = await deploy();
      await acceptedTask(escrow, "task-delivery-outsider");
      await networkHelpers.time.increase(3_601);

      await assert.rejects(() =>
        escrow.write.claimDeliveryTimeout([0n], { account: outsider.account }),
      );
      assert.equal((await readTask(escrow))[7], IN_PROGRESS);
    });
  });
});
