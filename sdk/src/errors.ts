export enum HanamiErrorCode {
  FeeTooHigh = 6000,
  InvalidDuration = 6001,
  InvalidAmount = 6002,
  InsufficientLiquidity = 6003,
  NoLiquidity = 6004,
  MathOverflow = 6005,
  SlippageExceeded = 6006,
  BloomNotMatured = 6007,
  AlreadyMatured = 6008,
  AlreadySettled = 6009,
  Unauthorized = 6010,
  PoolMismatch = 6011,
  InvalidVault = 6012,
  InvalidMint = 6013,
}

export const HANAMI_ERROR_MESSAGES: Record<number, string> = {
  6000: "Fee exceeds maximum (10%)",
  6001: "Bloom duration out of allowed range",
  6002: "Amount must be greater than zero",
  6003: "Liquidity resulting from deposit is zero",
  6004: "No liquidity in pool",
  6005: "Math overflow",
  6006: "Slippage exceeded",
  6007: "Bloom has not yet matured",
  6008: "Bloom has already matured (use settleBloom instead)",
  6009: "Bloom already settled",
  6010: "Unauthorized",
  6011: "Pool mismatch",
  6012: "Invalid vault",
  6013: "Invalid mint",
};

export class HanamiError extends Error {
  readonly code: HanamiErrorCode;
  readonly cause?: unknown;

  constructor(code: HanamiErrorCode, message?: string, cause?: unknown) {
    super(message ?? HANAMI_ERROR_MESSAGES[code] ?? `Unknown HANAMI error ${code}`);
    this.name = "HanamiError";
    this.code = code;
    this.cause = cause;
  }

  static fromAnchor(err: unknown): HanamiError | null {
    if (typeof err !== "object" || err === null) return null;
    const anyErr = err as { error?: { errorCode?: { number?: number; code?: string } } };
    const num = anyErr.error?.errorCode?.number;
    if (typeof num === "number" && num in HANAMI_ERROR_MESSAGES) {
      return new HanamiError(num as HanamiErrorCode, HANAMI_ERROR_MESSAGES[num], err);
    }
    return null;
  }
}
