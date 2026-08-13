export interface InjectedEthereum {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
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
