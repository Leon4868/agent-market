import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { buildApp } from "../src/app.js";

const app = buildApp();
after(() => app.close());

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
});
