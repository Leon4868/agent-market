const WEI_PER_ETH = 10n ** 18n;

/// Amounts travel as wei strings so JSON never sees a float. Everything downstream formats from
/// BigInt for the same reason.
export function formatEth(amount: string | bigint) {
  const wei = typeof amount === "bigint" ? amount : BigInt(amount);
  const whole = wei / WEI_PER_ETH;
  const fraction = (wei % WEI_PER_ETH).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} ETH`;
}
