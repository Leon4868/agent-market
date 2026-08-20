import { useState } from "react";

import { connectInjectedWallet, disconnectWallet } from "../web3/injected";

type WalletButtonProps = {
  address: string | null;
  onConnected: (address: string) => void;
  onDisconnected: () => void;
};

export function WalletButton({ address, onConnected, onDisconnected }: WalletButtonProps) {
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

  async function handleDisconnect() {
    await disconnectWallet();
    onDisconnected();
  }

  // The address itself lives in IdentityBadge; repeating it here just made the topbar say the
  // same thing twice. Connected state shows only the way out.
  return (
    <div className="wallet-control">
      {address ? (
        <button className="wallet-disconnect" onClick={handleDisconnect} type="button">
          断开
        </button>
      ) : (
        <button
          className="wallet-button"
          disabled={isConnecting}
          onClick={handleConnect}
          type="button"
        >
          {isConnecting ? "连接中…" : "连接 MetaMask"}
        </button>
      )}
      {error ? <p className="wallet-error">{error}</p> : null}
    </div>
  );
}
