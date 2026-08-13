import { randomUUID } from "node:crypto";

import Fastify, { type FastifyRequest } from "fastify";

import { createAgentSchema, createTaskSchema } from "./schemas.js";

function requestId(request: FastifyRequest): string {
  return request.id;
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

    return reply.status(201).send({
      requestId: requestId(request),
      data: {
        id: `agent_${randomUUID()}`,
        name: parsed.data.name,
        category: parsed.data.category,
        walletAddress: parsed.data.walletAddress,
        status: "DRAFT",
      },
    });
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

    return reply.status(201).send({
      requestId: requestId(request),
      data: {
        id: `task_${randomUUID()}`,
        title: parsed.data.title,
        budget: parsed.data.budget,
        status: "DRAFT",
      },
    });
  });

  return app;
}
