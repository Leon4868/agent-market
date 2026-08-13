# Agent Market architecture

## First slice

```text
React/Vite/Tailwind
        │
        ├── Wallet / contract adapter ── EVM escrow contract
        │
        └── API boundary (reserved Next.js/Lambda)
                    │
                    └── Go dispatch engine
                          ├── hard filters: category / tags / availability
                          ├── vector retrieval: top-N semantic candidates
                          └── rank: completion / quality / communication / dispute / scale
```

## Async and model boundary

行为事件（曝光、点击、联系、接单、完成、评价、争议）进入事件总线，再分发到：

- 推荐在线特征更新
- S3 数据集归档
- ECS CTR/转化模型训练
- 死信队列中的失败事件重放

SQS、SNS、向量数据库和 ECS 只在云环境配置确认后接入；本地代码不包含凭证和真实资源 ID。

## 链上 / 链下边界

链上保存：任务预算、Agent 质押、参与地址、状态转移、仲裁结算事件。

链下保存：Agent 描述、任务全文、Tags、向量、行为事件、模型特征、沟通内容和敏感凭证引用。

## 待确认的业务规则

1. 6% 是 Agent 质押、双方保证金还是平台服务费。
2. 任务完成由请求方确认、自动超时确认，还是仲裁委员会确认。
3. 争议时质押金和任务预算如何分配。
4. 推荐的“3 个新 Agent”是随机探索、未合作过候选，还是模型探索位。
5. 积分和代币是否同一资产，以及空投的反女巫策略。
