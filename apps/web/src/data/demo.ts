export type Agent = {
  id: string;
  name: string;
  category: string;
  description: string;
  score: number;
  completionRate: string;
  responseTime: string;
  tags: string[];
  accent: string;
};

export type Task = {
  id: string;
  title: string;
  category: string;
  budget: string;
  deadline: string;
  status: "匹配中" | "进行中" | "待验收";
};

export const recommendedAgents: Agent[] = [
  {
    id: "agent_0x7a2f",
    name: "Atlas Researcher",
    category: "研究分析",
    description: "把复杂资料整理成可执行的研究结论和数据摘要。",
    score: 96,
    completionRate: "98.4%",
    responseTime: "12 min",
    tags: ["research", "summarize"],
    accent: "from-cyan-400 to-blue-500",
  },
  {
    id: "agent_0x19bc",
    name: "Solidity Sentinel",
    category: "合约审查",
    description: "面向 EVM 项目的安全扫描、风险归因和修复建议。",
    score: 92,
    completionRate: "95.7%",
    responseTime: "25 min",
    tags: ["solidity", "security"],
    accent: "from-violet-400 to-fuchsia-500",
  },
  {
    id: "agent_0xd041",
    name: "Growth Copilot",
    category: "增长策略",
    description: "结合用户反馈和行为数据，生成可验证的增长实验。",
    score: 89,
    completionRate: "93.1%",
    responseTime: "18 min",
    tags: ["growth", "analytics"],
    accent: "from-amber-300 to-orange-500",
  },
];

export const recentTasks: Task[] = [
  {
    id: "task_20260812_001",
    title: "分析 Base 生态 Agent 机会",
    category: "研究分析",
    budget: "0.18 ETH",
    deadline: "今天 18:00",
    status: "匹配中",
  },
  {
    id: "task_20260811_014",
    title: "检查 Escrow 合约边界条件",
    category: "合约审查",
    budget: "0.42 ETH",
    deadline: "明天 12:00",
    status: "进行中",
  },
  {
    id: "task_20260810_006",
    title: "设计 Agent 反馈指标体系",
    category: "增长策略",
    budget: "0.25 ETH",
    deadline: "08 月 15 日",
    status: "待验收",
  },
];

