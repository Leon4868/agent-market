# Infrastructure boundary

建议的部署拓扑：

```text
Cloudflare
  ├── static web / edge routing
  └── API origin
        ├── Next.js API / Lambda
        ├── Go dispatch service / ECS
        ├── SQS + SNS + DLQ
        ├── vector database
        └── ECS model training jobs
```

当前只保留边界说明。生产接入前需要补充：网络拓扑、IAM 最小权限、日志脱敏、事件重试策略、模型版本发布和回滚方案。
