import BN from "bn.js";

const Q64 = new BN(1).shln(64);
const SLOTS_PER_SECOND = 2.5;

export function formatLamports(lamports: BN | number, decimals: number): string {
  const bn = BN.isBN(lamports) ? lamports : new BN(lamports);
  const factor = new BN(10).pow(new BN(decimals));
  const whole = bn.div(factor).toString();
  const frac = bn.mod(factor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${whole}.${frac}` : whole;
}

export function slotsToDuration(slots: BN | number): {
  seconds: number;
  minutes: number;
  hours: number;
  days: number;
} {
  const n = typeof slots === "number" ? slots : slots.toNumber();
  const seconds = n / SLOTS_PER_SECOND;
  return {
    seconds,
    minutes: seconds / 60,
    hours: seconds / 3600,
    days: seconds / 86400,
  };
}

export function priceFromReserves(reserveA: BN, reserveB: BN): BN {
  if (reserveB.isZero()) return new BN(0);
  return reserveA.mul(Q64).div(reserveB);
}

export function applyChirigiwaPenalty(amount: BN, penaltyBps = 500): BN {
  return amount.mul(new BN(10_000 - penaltyBps)).div(new BN(10_000));
}

export function isqrtBN(n: BN): BN {
  if (n.ltn(2)) return n.clone();
  let x = n.clone();
  let y = n.addn(1).divn(2);
  while (y.lt(x)) {
    x = y;
    y = x.add(n.div(x)).divn(2);
  }
  return x;
}
