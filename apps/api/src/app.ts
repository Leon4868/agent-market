import { randomUUID } from "node:crypto";

import Fastify, { type FastifyRequest } from "fastify";

import { readEscrowConfig, verifyEscrowAction } from "./chain.js";
import {
  chainTransactionSchema,
  createAgentSchema,
  createMatchSchema,
  createTaskSchema,
} from "./schemas.js";
import { allowedFrom, nextStatus } from "./taskFlow.js";
import {
  advanceTask,
  findAgent,
  listAgents,
  findTask,
  listTasks,
  saveAgent,
  saveTask,
  type StoredAgent,
  type StoredTask,
} from "./store.js";

function requestId(request: FastifyRequest): string {
  return request.id;
}

type CatalogEntry = {
  id: string;
  name: string;
  category: string;
  tags: string[];
  metrics: Record<string, number>;
  isNewcomer: boolean;
};

const dispatchUrl = process.env.DISPATCH_URL ?? "http://127.0.0.1:8080";
const dispatchTimeoutMs = 3_000;

/// credentialRef never leaves the server: api-contract.md only allows a key reference to be
/// stored, and no handler may echo it back.
function publicAgent(agent: StoredAgent) {
  const { credentialRef: _credentialRef, ...rest } = agent;
  return rest;
}

function publicTask(task: StoredTask) {
  return {
    id: task.id,
    title: task.title,
    category: task.category,
    tags: task.tags,
    budget: task.budget,
    deadline: task.deadline,
    status: task.status,
    requesterWallet: task.requesterWallet,
    agentWallet: task.agentWallet,
    chainTaskId: task.chainTaskId,
    transactionHash: task.transactionHash,
    history: task.history,
  };
}

/// The catalog lives in the dispatch engine while registrations land in the local store, so a
/// browsable market is the two of them side by side. `matchable` is the honest difference: only
/// engine agents can be recommended today, and a freshly registered Agent is not one of them yet.
type MarketAgent = {
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  metrics: Record<string, number> | null;
  matchable: boolean;
};

function marketAgents(catalog: CatalogEntry[], registered: StoredAgent[]): MarketAgent[] {
  const known = new Set(catalog.map((entry) => entry.id));
  return [
    ...catalog.map((entry) => ({
      id: entry.id,
      name: entry.name,
      category: entry.category,
      description: "",
      tags: entry.tags,
      metrics: entry.isNewcomer ? null : entry.metrics,
      matchable: true,
    })),
    ...registered
      .filter((agent) => !known.has(agent.id))
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        category: agent.category,
        description: agent.description,
        tags: agent.tags,
        metrics: null,
        matchable: false,
      })),
  ];
}

export function buildApp() {
  const app = Fastify({
    logger: false,
    genReqId(request) {
      const incoming = request.headers["x-request-id"];
      return typeof incoming === "string" && incoming.length <= 128
        ? incoming
        : `req_${randomUUID()}`;
    },
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", requestId(request));
    return payload;
  });

  app.get("/healthz", async (request) => ({
    requestId: requestId(request),
    data: { status: "ok", service: "agent-market-api" },
  }));

  app.post("/v1/agents", async (request, reply) => {
    const parsed = createAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        requestId: requestId(request),
        error: {
          code: "AGENT_INPUT_INVALID",
          message: "Agent 注册信息不完整",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }

    const agent = saveAgent(parsed.data);
    return reply.status(201).send({ requestId: requestId(request), data: publicAgent(agent) });
  });

  /// Public facts about the escrow, so the client can tell roles apart before a wallet is
  /// connected — and for visitors who never connect one.
  app.get("/v1/chain/config", async (request) => ({
    requestId: requestId(request),
    data: await readEscrowConfig(),
  }));

  app.get("/v1/agents", async (request, reply) => {
    let upstream: Response;
    try {
      upstream = await fetch(`${dispatchUrl}/v1/agents`, {
        headers: { "x-request-id": requestId(request) },
        signal: AbortSignal.timeout(dispatchTimeoutMs),
      });
    } catch {
      return reply.status(502).send({
        requestId: requestId(request),
        error: { code: "AGENT_CATALOG_UNAVAILABLE", message: "Agent 目录服务不可用" },
      });
    }
    if (!upstream.ok) {
      return reply.status(502).send({
        requestId: requestId(request),
        error: { code: "AGENT_CATALOG_FAILED", message: "Agent 目录服务返回错误" },
      });
    }

    const payload = (await upstream.json()) as { data?: CatalogEntry[] };
    return reply.send({
      requestId: requestId(request),
      data: marketAgents(payload.data ?? [], listAgents()),
    });
  });

  app.get("/v1/agents/:agentId", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const agent = findAgent(agentId);
    if (!agent) {
      return reply.status(404).send({
        requestId: requestId(request),
        error: { code: "AGENT_NOT_FOUND", message: "Agent 不存在" },
      });
    }
    return reply.send({ requestId: requestId(request), data: publicAgent(agent) });
  });

  app.post("/v1/tasks", async (request, reply) => {
    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        requestId: requestId(request),
        error: {
          code: "TASK_INPUT_INVALID",
          message: "任务信息不完整",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }

    if (new Date(parsed.data.deadline).getTime() <= Date.now()) {
      return reply.status(400).send({
        requestId: requestId(request),
        error: {
          code: "TASK_DEADLINE_INVALID",
          message: "截止时间必须晚于当前时间",
        },
      });
    }

    const task = saveTask(parsed.data, parsed.data.requesterWallet);
    return reply.status(201).send({ requestId: requestId(request), data: publicTask(task) });
  });

  app.get("/v1/tasks", async (request) => ({
    requestId: requestId(request),
    data: listTasks().map(publicTask),
  }));

  /// Advances a task along the escrow state machine, but only after the chain independently
  /// confirms the action actually happened and belongs to this task. The client's word is never
  /// enough: every fact recorded here is decoded from the transaction receipt.
  app.post("/v1/tasks/:taskId/chain-transactions", async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = chainTransactionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        requestId: requestId(request),
        error: {
          code: "CHAIN_INPUT_INVALID",
          message: "链上交易信息不完整",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }

    const task = findTask(taskId);
    if (!task) {
      return reply.status(404).send({
        requestId: requestId(request),
        error: { code: "TASK_NOT_FOUND", message: "任务不存在" },
      });
    }
    if (!allowedFrom(parsed.data.action, task.status)) {
      return reply.status(409).send({
        requestId: requestId(request),
        error: {
          code: "TASK_INVALID_STATE",
          message: `任务当前是 ${task.status}，不允许执行 ${parsed.data.action}`,
        },
      });
    }
    if (parsed.data.chainId !== task.budget.chainId) {
      return reply.status(400).send({
        requestId: requestId(request),
        error: { code: "CHAIN_ID_MISMATCH", message: "交易所在链与任务预算的链不一致" },
      });
    }

    const check = await verifyEscrowAction({
      action: parsed.data.action,
      transactionHash: parsed.data.transactionHash as `0x${string}`,
      task,
    });
    if (!check.ok) {
      return reply.status(400).send({
        requestId: requestId(request),
        error: { code: check.code, message: check.message },
      });
    }

    // The actor is whoever actually sent the transaction, taken from the receipt. Inferring it
    // from the action would misattribute every step a second role can also trigger.
    const updated = advanceTask(task.id, nextStatus(parsed.data.action, check.facts), check.facts.caller, {
      transactionHash: parsed.data.transactionHash,
      chainTaskId: check.facts.chainTaskId,
      agentWallet: check.facts.agentWallet,
    });
    return reply.send({ requestId: requestId(request), data: publicTask(updated as StoredTask) });
  });

  app.post("/v1/matches", async (request, reply) => {
    const parsed = createMatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        requestId: requestId(request),
        error: {
          code: "MATCH_INPUT_INVALID",
          message: "推荐请求参数不合法",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }

    // The dispatch engine cannot exclude agents yet. Rejecting is safer than forwarding a
    // request whose result would still contain everything the caller asked to leave out.
    if (parsed.data.excludeAgentIds.length > 0) {
      return reply.status(400).send({
        requestId: requestId(request),
        error: {
          code: "MATCH_EXCLUDE_UNSUPPORTED",
          message: "excludeAgentIds 尚未实现，暂时不能使用",
        },
      });
    }

    let upstream: Response;
    try {
      upstream = await fetch(`${dispatchUrl}/v1/matches`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId(request),
        },
        body: JSON.stringify({
          category: parsed.data.category ?? "",
          query: parsed.data.query ?? "",
          tags: parsed.data.tags,
        }),
        signal: AbortSignal.timeout(dispatchTimeoutMs),
      });
    } catch {
      return reply.status(502).send({
        requestId: requestId(request),
        error: { code: "MATCH_UPSTREAM_UNAVAILABLE", message: "推荐服务不可用" },
      });
    }

    if (!upstream.ok) {
      return reply.status(502).send({
        requestId: requestId(request),
        error: { code: "MATCH_UPSTREAM_FAILED", message: "推荐服务返回错误" },
      });
    }

    const payload = (await upstream.json()) as { data?: unknown };
    return reply.send({ requestId: requestId(request), data: payload.data ?? [] });
  });

  return app;
}
