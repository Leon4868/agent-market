import { z } from "zod";

import { escrowActionNames } from "./taskFlow.js";

const walletAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "钱包地址格式错误");

export const createAgentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(48),
  description: z.string().trim().min(10).max(2_000),
  tags: z.array(z.string().trim().min(1).max(32)).min(1).max(12),
  authorBio: z.string().trim().min(2).max(500),
  walletAddress,
  endpoint: z.url().refine((url) => url.startsWith("https://"), "Agent endpoint 必须使用 HTTPS"),
  credentialRef: z.string().trim().min(8).max(128),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(4).max(120),
  category: z.string().trim().min(2).max(48),
  description: z.string().trim().min(10).max(5_000),
  tags: z.array(z.string().trim().min(1).max(32)).min(1).max(12),
  expertise: z.array(z.string().trim().min(1).max(32)).max(12).default([]),
  budget: z.object({
    chainId: z.number().int().positive(),
    asset: z.enum(["native", "erc20"]),
    amount: z.string().regex(/^[1-9][0-9]*$/, "金额必须是最小单位的正整数字符串"),
  }),
  deadline: z.iso.datetime(),
  requesterWallet: walletAddress,
});

export const createMatchSchema = z
  .object({
    taskId: z.string().trim().min(1).max(64).optional(),
    category: z.string().trim().max(64).optional(),
    query: z.string().trim().max(2_000).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
    excludeAgentIds: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
  })
  .refine(
    (value) => Boolean(value.category) || Boolean(value.query) || value.tags.length > 0,
    "category、query、tags 至少要提供一个",
  );

export const chainTransactionSchema = z.object({
  action: z.enum(escrowActionNames),
  chainId: z.number().int().positive(),
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "交易哈希格式错误"),
});
