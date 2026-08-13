# API / Lambda BFF

Fastify 实现的最小 API/BFF 骨架，可在本地作为 Node 服务运行，也可在后续增加 AWS Lambda adapter。

当前仅实现：

- `GET /healthz`
- `POST /v1/agents`：校验 Agent 注册输入，返回 mock ID；不会回传凭证引用
- `POST /v1/tasks`：校验任务输入，返回 mock ID 和初始状态

数据目前不持久化。接 PostgreSQL、钱包签名认证和密钥管理前，不应把该接口作为生产服务使用。
