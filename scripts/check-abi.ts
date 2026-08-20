// A hand-written ABI drifts silently: the contract changes, the frontend keeps encoding the old
// signature, and the failure only shows up as a reverted transaction. This pins the fragments the
// web app ships against the compiled artifact.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { escrowFragments } from "../apps/api/src/escrowFragments.js";
import { escrowAbi } from "../apps/web/src/web3/escrowAbi.js";

const artifactPath =
  "contracts/artifacts/contracts/AgentTaskEscrow.sol/AgentTaskEscrow.json";
const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
  abi: Array<Record<string, unknown>>;
};

const shipped = [
  { source: "apps/web/src/web3/escrowAbi.ts", fragments: escrowAbi as readonly Record<string, unknown>[] },
  { source: "apps/api/src/escrowFragments.ts", fragments: escrowFragments as readonly Record<string, unknown>[] },
];

for (const { source, fragments } of shipped) {
  for (const fragment of fragments) {
    const compiled = artifact.abi.find(
      (entry) => entry.type === fragment.type && entry.name === fragment.name,
    );
    assert.ok(compiled, `合约里找不到 ${fragment.type} ${fragment.name}（${source}）`);
    assert.deepEqual(
      JSON.parse(JSON.stringify(fragment)),
      compiled,
      `${fragment.name} 的 ABI 与合约不一致，请同步 ${source}`,
    );
  }
}

const total = shipped.reduce((sum, entry) => sum + entry.fragments.length, 0);
console.log(`ABI 同步检查通过：${total} 个片段与合约一致（${shipped.length} 个文件）`);
