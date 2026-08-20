import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { buildApp } from "../src/app.js";
import { allowedFrom, nextStatus } from "../src/taskFlow.js";

const app = buildApp();
after(() => app.close());

const realFetch = globalThis.fetch;

/// Swaps the global fetch for the duration of one call so a test can stand in for the dispatch
/// engine without the suite depending on a running service.
async function withFetch<T>(stub: typeof fetch, run: () => Promise<T>): Promise<T> {
  globalThis.fetch = stub;
  try {
    return await run();
  } finally {
    globalThis.fetch = realFetch;
  }
}

describe("Agent Market API", () => {
  it("returns health with the incoming request id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { "x-request-id": "req_test_health" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["x-request-id"], "req_test_health");
    assert.equal(response.json().data.status, "ok");
  });

  it("rejects invalid Agent input", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/agents",
      payload: { name: "A" },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "AGENT_INPUT_INVALID");
  });

  it("creates an Agent without returning its credential reference", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/agents",
      payload: {
        name: "Atlas Researcher",
        category: "research",
        description: "Research and synthesis Agent for Web3 tasks.",
        tags: ["research", "summarize"],
        authorBio: "Agent builder",
        walletAddress: "0x1111111111111111111111111111111111111111",
        endpoint: "https://agent.example.com/run",
        credentialRef: "secret_ref_value",
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.includes("secret_ref_value"), false);
    assert.equal(response.body.includes("credentialRef"), false);
  });

  it("creates a validated draft task", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tasks",
      payload: {
        title: "Review escrow state transitions",
        category: "contract-review",
        description: "Check task lifecycle and fund release safety.",
        tags: ["solidity", "security"],
        expertise: ["evm"],
        budget: {
          chainId: 11_155_111,
          asset: "native",
          amount: "100000000000000000",
        },
        deadline: "2099-08-15T20:00:00Z",
        requesterWallet: "0x1111111111111111111111111111111111111111",
      },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().data.status, "DRAFT");
  });

  describe("POST /v1/matches", () => {
    it("rejects a request carrying no matching signal", async () => {
      const response = await app.inject({ method: "POST", url: "/v1/matches", payload: {} });

      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, "MATCH_INPUT_INVALID");
    });

    it("rejects excludeAgentIds while the engine cannot honour it", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/matches",
        payload: { category: "合约审查", excludeAgentIds: ["agent_0x19bc"] },
      });

      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, "MATCH_EXCLUDE_UNSUPPORTED");
    });

    it("forwards the request id and returns the engine candidates", async () => {
      let seenHeader: string | undefined;
      let seenBody: unknown;

      const response = await withFetch(
        (async (_url, init) => {
          const headers = (init?.headers ?? {}) as Record<string, string>;
          seenHeader = headers["x-request-id"];
          seenBody = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ data: [{ id: "agent_0x19bc" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }) as typeof fetch,
        () =>
          app.inject({
            method: "POST",
            url: "/v1/matches",
            headers: { "x-request-id": "req_test_match" },
            payload: { category: "合约审查", tags: ["solidity"] },
          }),
      );

      assert.equal(response.statusCode, 200);
      assert.equal(seenHeader, "req_test_match");
      assert.deepEqual(seenBody, { category: "合约审查", query: "", tags: ["solidity"] });
      assert.equal(response.json().data[0].id, "agent_0x19bc");
      assert.equal(response.json().requestId, "req_test_match");
    });

    it("returns 502 when the engine is unreachable", async () => {
      const response = await withFetch(
        (() => Promise.reject(new Error("connect ECONNREFUSED"))) as typeof fetch,
        () =>
          app.inject({
            method: "POST",
            url: "/v1/matches",
            payload: { query: "审计合约" },
          }),
      );

      assert.equal(response.statusCode, 502);
      assert.equal(response.json().error.code, "MATCH_UPSTREAM_UNAVAILABLE");
    });
  });

  describe("GET /v1/agents", () => {
    const catalogEntry = {
      id: "agent_0x19bc",
      name: "Solidity Sentinel",
      category: "合约审查",
      tags: ["Solidity"],
      metrics: { completionRate: 0.957, qualityScore: 0.92, completedTasks: 86 },
      isNewcomer: false,
    };

    function catalogStub(entries: unknown[]) {
      return (async () =>
        new Response(JSON.stringify({ data: entries }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as typeof fetch;
    }

    it("lists engine agents as matchable and locally registered ones as not", async () => {
      const registered = await app.inject({
        method: "POST",
        url: "/v1/agents",
        payload: {
          name: "Fresh Recruit",
          category: "研究分析",
          description: "Newly registered agent awaiting onboarding.",
          tags: ["研究"],
          authorBio: "Agent builder",
          walletAddress: "0x3333333333333333333333333333333333333333",
          endpoint: "https://agent.example.com/run",
          credentialRef: "secret_ref_value",
        },
      });
      const registeredId = registered.json().data.id;

      const response = await withFetch(catalogStub([catalogEntry]), () =>
        app.inject({ method: "GET", url: "/v1/agents" }),
      );

      assert.equal(response.statusCode, 200);
      const listed = response.json().data as Array<{
        id: string;
        matchable: boolean;
        metrics: unknown;
      }>;

      const fromEngine = listed.find((agent) => agent.id === catalogEntry.id);
      assert.ok(fromEngine, "引擎目录里的 Agent 应当出现");
      assert.equal(fromEngine.matchable, true);

      const fromStore = listed.find((agent) => agent.id === registeredId);
      assert.ok(fromStore, "注册过的 Agent 不应当从市场里消失");
      assert.equal(fromStore.matchable, false, "尚未接入引擎的 Agent 不能标成可撮合");
      assert.equal(fromStore.metrics, null);
    });

    it("reports no metrics for a newcomer rather than a row of zeros", async () => {
      const response = await withFetch(
        catalogStub([{ ...catalogEntry, id: "agent_0x5e10", isNewcomer: true }]),
        () => app.inject({ method: "GET", url: "/v1/agents" }),
      );

      const newcomer = (response.json().data as Array<{ id: string; metrics: unknown }>).find(
        (agent) => agent.id === "agent_0x5e10",
      );
      assert.equal(newcomer?.metrics, null);
    });

    it("never leaks a credential reference through the market listing", async () => {
      const response = await withFetch(catalogStub([catalogEntry]), () =>
        app.inject({ method: "GET", url: "/v1/agents" }),
      );

      assert.equal(response.body.includes("secret_ref_value"), false);
      assert.equal(response.body.includes("credentialRef"), false);
    });

    it("returns 502 when the catalog engine is unreachable", async () => {
      const response = await withFetch(
        (() => Promise.reject(new Error("connect ECONNREFUSED"))) as typeof fetch,
        () => app.inject({ method: "GET", url: "/v1/agents" }),
      );

      assert.equal(response.statusCode, 502);
      assert.equal(response.json().error.code, "AGENT_CATALOG_UNAVAILABLE");
    });
  });

  describe("持久化与链上校验", () => {
    async function createTask(overrides: Record<string, unknown> = {}) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        payload: {
          title: "Review escrow state transitions",
          category: "contract-review",
          description: "Check task lifecycle and fund release safety.",
          tags: ["solidity"],
          expertise: ["evm"],
          budget: { chainId: 31_337, asset: "native", amount: "1000000000000000000" },
          deadline: "2099-08-15T20:00:00Z",
          requesterWallet: "0x1111111111111111111111111111111111111111",
          ...overrides,
        },
      });
      return response.json().data;
    }

    it("keeps a registered Agent retrievable without its credential reference", async () => {
      const created = await app.inject({
        method: "POST",
        url: "/v1/agents",
        payload: {
          name: "Solidity Sentinel",
          category: "contract-review",
          description: "Security scanning agent for EVM projects.",
          tags: ["solidity", "security"],
          authorBio: "Agent builder",
          walletAddress: "0x2222222222222222222222222222222222222222",
          endpoint: "https://agent.example.com/run",
          credentialRef: "secret_ref_value",
        },
      });

      const agentId = created.json().data.id;
      const fetched = await app.inject({ method: "GET", url: `/v1/agents/${agentId}` });

      assert.equal(fetched.statusCode, 200);
      assert.equal(fetched.json().data.name, "Solidity Sentinel");
      assert.equal(fetched.body.includes("secret_ref_value"), false);
    });

    it("returns 404 for an unknown Agent", async () => {
      const response = await app.inject({ method: "GET", url: "/v1/agents/agent_missing" });

      assert.equal(response.statusCode, 404);
      assert.equal(response.json().error.code, "AGENT_NOT_FOUND");
    });

    it("lists a created task with its DRAFT transition recorded", async () => {
      const task = await createTask();
      const listed = await app.inject({ method: "GET", url: "/v1/tasks" });

      const found = listed.json().data.find((item: { id: string }) => item.id === task.id);
      assert.ok(found, "任务应当出现在列表中");
      assert.equal(found.status, "DRAFT");
      assert.deepEqual(
        found.history.map((entry: { from: string | null; to: string }) => [entry.from, entry.to]),
        [[null, "DRAFT"]],
      );
    });

    it("rejects a chain transaction from a different chain", async () => {
      const task = await createTask();
      const response = await app.inject({
        method: "POST",
        url: `/v1/tasks/${task.id}/chain-transactions`,
        payload: { action: "CREATE_ESCROW", chainId: 1, transactionHash: `0x${"ab".repeat(32)}` },
      });

      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, "CHAIN_ID_MISMATCH");
    });

    it("refuses to publish a task on an unverifiable claim", async () => {
      const task = await createTask();
      const response = await app.inject({
        method: "POST",
        url: `/v1/tasks/${task.id}/chain-transactions`,
        payload: { action: "CREATE_ESCROW", chainId: 31_337, transactionHash: `0x${"ab".repeat(32)}` },
      });

      // Never take the client's word for a settlement. Which check fires first depends on
      // whether an escrow address is configured, but either way the claim is unverifiable and
      // the task must not move.
      assert.equal(response.statusCode, 400);
      assert.ok(
        ["CHAIN_NOT_CONFIGURED", "CHAIN_RECEIPT_NOT_FOUND"].includes(response.json().error.code),
        `unexpected error code: ${response.json().error.code}`,
      );

      const listed = await app.inject({ method: "GET", url: "/v1/tasks" });
      const found = listed.json().data.find((item: { id: string }) => item.id === task.id);
      assert.equal(found.status, "DRAFT");
    });

    it("returns 404 when settling a task that does not exist", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/tasks/task_missing/chain-transactions",
        payload: { action: "CREATE_ESCROW", chainId: 31_337, transactionHash: `0x${"ab".repeat(32)}` },
      });

      assert.equal(response.statusCode, 404);
      assert.equal(response.json().error.code, "TASK_NOT_FOUND");
    });
  });
  describe("生命周期状态机", () => {
    async function draft() {
      const response = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        payload: {
          title: "跑通完整生命周期",
          category: "contract-review",
          description: "Exercise the escrow state machine end to end.",
          tags: ["solidity"],
          expertise: ["evm"],
          budget: { chainId: 31_337, asset: "native", amount: "1000000000000000000" },
          deadline: "2099-08-15T20:00:00Z",
          requesterWallet: "0x1111111111111111111111111111111111111111",
        },
      });
      return response.json().data;
    }

    function claim(taskId: string, action: string) {
      return app.inject({
        method: "POST",
        url: `/v1/tasks/${taskId}/chain-transactions`,
        payload: { action, chainId: 31_337, transactionHash: `0x${"cd".repeat(32)}` },
      });
    }

    it("refuses to accept a task that was never published", async () => {
      const task = await draft();
      const response = await claim(task.id, "ACCEPT_TASK");

      assert.equal(response.statusCode, 409);
      assert.equal(response.json().error.code, "TASK_INVALID_STATE");
    });

    it("refuses to submit work on a task nobody accepted", async () => {
      const task = await draft();
      const response = await claim(task.id, "SUBMIT_TASK");

      assert.equal(response.statusCode, 409);
      assert.equal(response.json().error.code, "TASK_INVALID_STATE");
    });

    it("rejects an action the escrow does not have", async () => {
      const task = await draft();
      const response = await claim(task.id, "STEAL_FUNDS");

      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, "CHAIN_INPUT_INVALID");
    });

    it("checks the state machine before it trusts any chain claim", async () => {
      const task = await draft();
      // APPROVE_TASK is only legal from SUBMITTED. The rejection must come from the status
      // check, not from the (also unverifiable) transaction hash.
      const response = await claim(task.id, "APPROVE_TASK");

      assert.equal(response.statusCode, 409);
      assert.match(response.json().error.message, /DRAFT/);
    });
  });

  describe("状态机映射", () => {
    it("settles an arbitration for the Agent as a completion", () => {
      assert.equal(nextStatus("RESOLVE_DISPUTE", { favorAgent: true }), "COMPLETED");
    });

    it("unwinds an arbitration for the requester", () => {
      assert.equal(nextStatus("RESOLVE_DISPUTE", { favorAgent: false }), "CANCELLED");
    });

    it("only allows each action from the statuses the contract permits", () => {
      assert.equal(allowedFrom("ACCEPT_TASK", "PUBLISHED"), true);
      assert.equal(allowedFrom("ACCEPT_TASK", "SUBMITTED"), false);
      assert.equal(allowedFrom("CLAIM_DELIVERY_TIMEOUT", "IN_PROGRESS"), true);
      assert.equal(allowedFrom("CLAIM_REVIEW_TIMEOUT", "IN_PROGRESS"), false);
    });
  });
  describe("GET /v1/chain/config", () => {
    it("answers without a wallet so role display works before connecting", async () => {
      const response = await app.inject({ method: "GET", url: "/v1/chain/config" });

      assert.equal(response.statusCode, 200);
      const config = response.json().data as { escrowAddress: string | null; arbiter: string | null };
      // Whether an address is configured depends on the environment; what must hold is that the
      // shape is always answerable, never an error the client has to special-case.
      assert.ok("escrowAddress" in config && "arbiter" in config);
    });
  });
});
