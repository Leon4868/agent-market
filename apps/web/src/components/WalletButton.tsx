import { useState } from "react";

import { connectInjectedWallet, shortenAddress } from "../web3/injected";

type WalletButtonProps = {
  address: string | null;
  onConnected: (address: string) => void;
};

export function WalletButton({ address, onConnected }: WalletButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setError(null);
    setIsConnecting(true);

    try {
      onConnected(await connectInjectedWallet());
    } catch (connectError) {
      setError(
        connectError instanceof Error ? connectError.message : "连接钱包失败",
      );
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="wallet-control">
      <button
        className="wallet-button"
        disabled={isConnecting}
        onClick={handleConnect}
        type="button"
      >
        {isConnecting ? "连接中…" : address ? shortenAddress(address) : "连接 MetaMask"}
      </button>
      {error ? (
        <p className="wallet-error">{error}</p>
      ) : null}
    </div>
  );
}
