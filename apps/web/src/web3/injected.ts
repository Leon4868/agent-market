export interface InjectedEthereum {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: InjectedEthereum;
  }
}

export async function connectInjectedWallet(): Promise<string> {
  if (!window.ethereum) {
    throw new Error("未检测到 MetaMask，请先安装浏览器钱包。");
  }

  const result = await window.ethereum.request({
    method: "eth_requestAccounts",
  });
  const accounts = Array.isArray(result) ? result : [];
  const address = accounts.find(
    (account): account is string => typeof account === "string",
  );

  if (!address) {
    throw new Error("钱包没有返回可用地址。");
  }

  return address;
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/// MetaMask injects window.ethereum asynchronously, so anything that runs on mount can lose the
/// race and conclude there is no wallet at all. Waits for the announcement, then gives up.
export function waitForInjection(timeoutMs = 3_000): Promise<InjectedEthereum | null> {
  if (window.ethereum) return Promise.resolve(window.ethereum);

  return new Promise((resolve) => {
    const settle = () => {
      clearInterval(poll);
      clearTimeout(giveUp);
      window.removeEventListener("ethereum#initialized", settle);
      resolve(window.ethereum ?? null);
    };
    // Both paths are needed: some wallets fire the event, others just assign the property.
    window.addEventListener("ethereum#initialized", settle, { once: true });
    const poll = setInterval(() => window.ethereum && settle(), 100);
    const giveUp = setTimeout(settle, timeoutMs);
  });
}

/// Reads the already-authorised account without prompting, so a reload restores the session
/// instead of showing a disconnected wallet the user already connected.
export async function currentAccount(): Promise<string | null> {
  const ethereum = await waitForInjection();
  if (!ethereum) return null;
  const result = await ethereum.request({ method: "eth_accounts" });
  const accounts = Array.isArray(result) ? result : [];
  return accounts.find((account): account is string => typeof account === "string") ?? null;
}

/// Drops this site's access. EIP-1193 has no disconnect, so the local state is what actually
/// clears; wallet_revokePermissions makes MetaMask forget too when it supports it.
export async function disconnectWallet(): Promise<void> {
  try {
    await window.ethereum?.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    // Older wallets have no such method. Clearing our own state is still the visible effect.
  }
}

/// MetaMask switches accounts without reloading the page. Without this the app keeps acting as
/// the previous account, which is exactly wrong when accounts are how roles are told apart.
export function watchAccounts(onChange: (address: string | null) => void): () => void {
  let detach = () => undefined as void;
  let cancelled = false;

  // Registered only once the wallet exists; doing it synchronously on mount silently attaches
  // nothing when MetaMask has not injected itself yet.
  void waitForInjection().then((ethereum) => {
    if (cancelled || !ethereum?.on) return;
    detach = attach(ethereum, onChange);
  });

  return () => {
    cancelled = true;
    detach();
  };
}

function attach(
  ethereum: InjectedEthereum,
  onChange: (address: string | null) => void,
): () => void {
  const handleAccounts = (...args: never[]) => {
    const accounts = args[0] as unknown as string[];
    onChange(accounts?.[0] ?? null);
  };
  const handleChain = () => window.location.reload();

  ethereum.on?.("accountsChanged", handleAccounts);
  ethereum.on?.("chainChanged", handleChain);
  return () => {
    ethereum.removeListener?.("accountsChanged", handleAccounts);
    ethereum.removeListener?.("chainChanged", handleChain);
  };
}
