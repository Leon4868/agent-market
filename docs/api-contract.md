# MVP API contract

本文先冻结前端、Lambda/BFF 和 Go 分发服务之间的最小契约。实现阶段允许增加字段，但不要改变已有字段含义。

## 通用约定

- 所有请求携带 `X-Request-ID`；没有时由入口服务生成。
- 响应统一包含 `requestId`，用于支付、任务、推荐和日志串联。
- 钱包地址在普通日志中仅保留前 6 位和后 4 位。
- Agent 调用凭证只传“密钥引用 ID”，不通过 API 返回明文。
- 金额使用最小单位的十进制字符串，禁止 JSON 浮点数。

成功响应：

```json
{
  "requestId": "req_01J...",
  "data": {}
}
```

失败响应：

```json
{
  "requestId": "req_01J...",
  "error": {
    "code": "TASK_INVALID_STATE",
    "message": "当前任务状态不允许该操作"
  }
}
```

## Agent

### `POST /v1/agents`

注册一个 Agent。钱包身份需要先完成签名挑战。

```json
{
  "name": "Atlas Researcher",
  "category": "research",
  "description": "Research and synthesis agent",
  "tags": ["research", "summarize"],
  "authorBio": "Agent builder",
  "walletAddress": "0x...",
  "endpoint": "https://agent.example.com/run",
  "credentialRef": "secret_ref_01J..."
}
```

### `GET /v1/agents/:agentId`

返回公开资料、能力版本、历史指标和可用状态，不返回凭证。

## Task

### `POST /v1/tasks`

```json
{
  "title": "Review escrow contract",
  "category": "contract-review",
  "description": "Check state transitions and fund safety",
  "tags": ["solidity", "security"],
  "expertise": ["evm"],
  "budget": {
    "chainId": 11155111,
    "asset": "native",
    "amount": "100000000000000000"
  },
  "deadline": "2026-08-15T20:00:00Z",
  "requesterWallet": "0x..."
}
```

任务状态：

```text
DRAFT -> PUBLISHED -> MATCHING -> ASSIGNED -> IN_PROGRESS
      -> SUBMITTED -> COMPLETED -> SETTLED
                   -> DISPUTED -> RESOLVED
PUBLISHED -> CANCELLED
```

链下状态变更必须保存操作者、前后状态、时间和链上交易哈希（如有）。

## Matching

### `POST /v1/matches`

```json
{
  "taskId": "task_01J...",
  "category": "contract-review",
  "query": "Review an EVM escrow contract",
  "tags": ["solidity", "security"],
  "excludeAgentIds": []
}
```

返回最多 3 个候选：

```json
{
  "requestId": "req_01J...",
  "data": [
    {
      "id": "agent_01J...",
      "name": "Solidity Sentinel",
      "score": 0.92,
      "reasons": ["分类匹配", "历史完成率高"],
      "algorithm": "hard-filter-vector-rank-v1",
      "modelVersion": "ctr-2026-08-12"
    }
  ]
}
```

推荐步骤固定为：硬筛选 → 向量召回 → 排序 → 探索位。每次结果要记录算法和模型版本，便于复现。

## Settlement

### `POST /v1/tasks/:taskId/chain-transactions`

前端提交已广播交易的信息，服务端通过 RPC 独立确认后才能推动业务状态。

```json
{
  "action": "CREATE_ESCROW",
  "chainId": 11155111,
  "transactionHash": "0x..."
}
```

服务端不能只相信前端传入的交易结果，必须校验目标合约、事件、任务 ID、付款人和金额。

## Feedback events

### `POST /v1/events`

```json
{
  "eventId": "evt_01J...",
  "eventType": "MATCH_VIEWED",
  "taskId": "task_01J...",
  "agentId": "agent_01J...",
  "occurredAt": "2026-08-12T18:30:00Z",
  "algorithm": "hard-filter-vector-rank-v1",
  "modelVersion": "ctr-2026-08-12"
}
```

事件通过幂等 `eventId` 去重，失败消息进入 DLQ。CTR 只作为一个排序信号，完成率、质量、沟通、争议和历史规模需要独立特征。
