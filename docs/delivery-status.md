# Delivery status

规则层面的问题都已在 [决策记录](decisions.md) 冻结（D1–D7）。本文只跟踪工程进度。

## 已落地

- 独立 monorepo 目录和统一脚本
- React/Vite/Tailwind 产品工作台骨架
- MetaMask 注入钱包连接入口
- 内存持久化层（`apps/api/src/store.ts`）：Agent 与任务落库、任务状态机与变更历史（操作者/前后状态/时间/交易哈希）
- `GET /v1/agents/:agentId`、`GET /v1/tasks`、`POST /v1/tasks/:taskId/chain-transactions`
- 链上结算校验（`apps/api/src/chain.ts`）：按 api-contract 要求独立复核目标合约、事件、任务 ID、付款人和金额
- 前端发布任务：表单 → BFF 校验建草稿 → viem 调用 `createTask` 锁仓 → 等待回执，分阶段展示进度
- `npm run check:abi`：前端手写 ABI 与编译产物的一致性校验，已纳入 `npm run check`
- BFF `POST /v1/matches`：入参校验、转发 Go 引擎、透传 `x-request-id`、上游故障降级为 502
- Solidity 托管合约：6% 单边质押（D1）、争议分账（D5b）、可替换仲裁人（D5a）、交付与验收双超时（D7）
- Go 推荐服务：五维打分结构（D2）、2 高分 + 1 探索位（D3）、可解释候选结果
- Agent 目录：Go `GET /v1/agents` 输出完整目录，BFF 同名端点把它与本地注册的 Agent 合并，用 `matchable` 区分「已接入撮合」与「仅注册」
- 四个导航区各有内容：工作台、Agent 市场（分类/关键词筛选）、我的任务（发布 + 角色化操作）、结算与质押（资金位置、6% 质押、仲裁队列）
- 完整生命周期打通：接单 / 交付 / 验收 / 撤回 / 争议 / 仲裁 / 两个超时全部有链上调用、服务端复核与前端入口
- 角色由连接的账号推导而非选择（`apps/web/src/roles.ts`）：需求方与 Agent 是任务级关系，仲裁人是全局角色且只在任务处于争议时成立；MetaMask 换账号即时重算
- 顶栏常驻身份条：当前地址 + 持有的角色（需求方 ×N / 接单 Agent ×N / 仲裁人），未连接时明说「角色未知」
- 断开钱包入口：清本地状态，并在钱包支持时调 `wallet_revokePermissions` 让 MetaMask 一并忘记
- `GET /v1/chain/config` 由服务端读取托管合约的 `arbiter()`，不依赖注入钱包——未连接甚至没有钱包的访客也能看到仲裁人是谁
- 钱包注入是异步的，`waitForInjection()` 等到 `ethereum#initialized` 再挂监听，避免挂载时抢跑导致换账号无感知
- 服务端动作复核（`apps/api/src/taskFlow.ts` + `chain.ts`）：每个动作绑定一个事件、一组合法前置状态，并校验事件的链上任务 ID 属于本任务；`TaskCompleted` 还区分主动验收与超时结算
- 状态历史的 actor 取自交易回执的实际发起人，不按动作推断
- 顶部统计卡改为由 `GET /v1/tasks` 与 `GET /v1/agents` 实时派生，与下方面板同源
- 链上/链下边界、基础 API 契约、云基础设施边界

## 已占位，尚未接真实服务

- Next.js/Lambda BFF
- PostgreSQL 数据层：当前是进程内存储，**重启 API 即清空**。接入时按 `store.ts` 的现有接口替换实现，并补上 D6 的积分表
- 向量数据库
- SQS/SNS/DLQ
- ECS 模型训练
- Cloudflare/AWS 部署
- YD 代币与空投（D6 决定当前只做链下积分）

## 已知缺口

- 发布任务的钱包签名环节未做过端到端人工验证：自动化环境里没有 MetaMask 扩展。链上部分已用前端同一份 ABI 打通真实合约（见 `npm run check:abi` 与本地部署流程），未覆盖的只有钱包握手与链切换提示。
- 注册的 Agent 不会进入撮合引擎的目录，因此永远拿不到推荐。市场页用「待接入撮合」把这个断点显式标出来，而不是假装它们可被推荐。
- **后端只在客户端上报时才知道链上发生了什么。** 绕过前端直接调合约、或 API 重启丢失内存数据，都会让账面与链上分叉：本地实测合约余额 5.09 ETH 而账面只跟踪 3.65 ETH。需要事件监听器（`watchContractEvent` + 断点续读区块号），换 PostgreSQL 也解决不了。
- 合约的 `acceptTask` 不禁止需求方接自己的任务。前端不提供这个入口，但合约层没拦。
- `excludeAgentIds` 在 Go 引擎仍未实现。BFF 会以 `MATCH_EXCLUDE_UNSUPPORTED` 显式拒绝，而不是丢弃该字段后返回一份仍然包含被排除 Agent 的结果。
- 完成率对小样本没有平滑；当前靠新 Agent 指标一律为 0 规避（见 D2）。
- `Disputed` 状态没有超时，仲裁人不作为则资金锁定（见 decisions.md 末尾）。
- D4「AI 练他 不符合」原意待确认，属第二期。
