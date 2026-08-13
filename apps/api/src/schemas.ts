import { z } from "zod";

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
