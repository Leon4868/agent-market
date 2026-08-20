export type ChainConfig = {
  escrowAddress: string | null;
  arbiter: string | null;
};

/// Read from the server rather than the injected wallet: MetaMask refuses eth_call from a site
/// it is not connected to, which would leave the arbiter unknown exactly when a visitor is
/// deciding whether to connect at all.
export async function fetchChainConfig(): Promise<ChainConfig> {
  const response = await fetch("/v1/chain/config");
  if (!response.ok) return { escrowAddress: null, arbiter: null };
  const body = (await response.json()) as { data?: ChainConfig };
  return body.data ?? { escrowAddress: null, arbiter: null };
}
