import {
  AnchorProvider,
  BN,
  Program,
  Wallet,
  type Idl,
} from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  type Signer,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";

import {
  PROGRAM_ID,
  derivePoolPda,
  deriveVaultAPda,
  deriveVaultBPda,
  deriveBloomPda,
  sortMintPair,
} from "./pda";
import { HanamiError } from "./errors";
import type {
  ClientConfig,
  PoolState,
  BloomPositionState,
  InitializePoolArgs,
  CreateBloomArgs,
  SwapArgs,
  SettleArgs,
} from "./types";

export class HanamiClient {
  readonly connection: Connection;
  readonly wallet: Signer;
  readonly programId: PublicKey;
  readonly provider: AnchorProvider;
  private program: Program<Idl> | null = null;
  private idlPromise: Promise<Idl> | null = null;

  constructor(cfg: ClientConfig) {
    this.connection = cfg.connection;
    this.wallet = cfg.wallet;
    this.programId = cfg.programId ?? PROGRAM_ID;
    const anchorWallet = new Wallet(cfg.wallet as never);
    this.provider = new AnchorProvider(cfg.connection, anchorWallet, {
      commitment: cfg.commitment ?? "confirmed",
    });
  }

  private async loadProgram(): Promise<Program<Idl>> {
    if (this.program) return this.program;
    if (!this.idlPromise) {
      this.idlPromise = Program.fetchIdl(this.programId, this.provider).then((idl) => {
        if (!idl) throw new Error(`IDL not found for program ${this.programId.toBase58()}`);
        return idl;
      });
    }
    const idl = await this.idlPromise;
    this.program = new Program(idl, this.provider);
    return this.program;
  }

  async initializePool(args: InitializePoolArgs): Promise<{ signature: string; pool: PublicKey }> {
    const program = await this.loadProgram();
    const [a, b] = sortMintPair(args.tokenAMint, args.tokenBMint);
    const [pool] = derivePoolPda(a, b, this.programId);
    const [vaultA] = deriveVaultAPda(pool, this.programId);
    const [vaultB] = deriveVaultBPda(pool, this.programId);

    try {
      const signature = await program.methods
        .initializePool(args.feeBps)
        .accounts({
          authority: this.wallet.publicKey,
          tokenAMint: a,
          tokenBMint: b,
          pool,
          vaultA,
          vaultB,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      return { signature, pool };
    } catch (e) {
      const wrapped = HanamiError.fromAnchor(e);
      throw wrapped ?? e;
    }
  }

  async createBloom(args: CreateBloomArgs): Promise<{ signature: string; bloom: PublicKey }> {
    const program = await this.loadProgram();
    const pool = await this.getPool(args.pool);
    const [vaultA] = deriveVaultAPda(args.pool, this.programId);
    const [vaultB] = deriveVaultBPda(args.pool, this.programId);
    const nonce = args.nonce ?? new BN(Date.now() % 1_000_000);
    const [bloom] = deriveBloomPda(args.pool, this.wallet.publicKey, nonce, this.programId);

    const userTokenA = getAssociatedTokenAddressSync(pool.tokenAMint, this.wallet.publicKey);
    const userTokenB = getAssociatedTokenAddressSync(pool.tokenBMint, this.wallet.publicKey);

    try {
      const signature = await program.methods
        .createBloom(nonce, args.amountA, args.amountB, args.durationSlots)
        .accounts({
          user: this.wallet.publicKey,
          pool: args.pool,
          vaultA,
          vaultB,
          userTokenA,
          userTokenB,
          bloom,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      return { signature, bloom };
    } catch (e) {
      const wrapped = HanamiError.fromAnchor(e);
      throw wrapped ?? e;
    }
  }

  async swap(args: SwapArgs): Promise<string> {
    const program = await this.loadProgram();
    const pool = await this.getPool(args.pool);
    const [vaultA] = deriveVaultAPda(args.pool, this.programId);
    const [vaultB] = deriveVaultBPda(args.pool, this.programId);
    const userTokenA = getAssociatedTokenAddressSync(pool.tokenAMint, this.wallet.publicKey);
    const userTokenB = getAssociatedTokenAddressSync(pool.tokenBMint, this.wallet.publicKey);

    try {
      return await program.methods
        .swap(args.amountIn, args.minOut, args.aToB)
        .accounts({
          user: this.wallet.publicKey,
          pool: args.pool,
          vaultA,
          vaultB,
          userTokenA,
          userTokenB,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    } catch (e) {
      const wrapped = HanamiError.fromAnchor(e);
      throw wrapped ?? e;
    }
  }

  async settleBloom(args: SettleArgs): Promise<string> {
    return this.invokeSettle("settleBloom", args);
  }

  async chirigiwa(args: SettleArgs): Promise<string> {
    return this.invokeSettle("chirigiwa", args);
  }

  private async invokeSettle(
    method: "settleBloom" | "chirigiwa",
    args: SettleArgs,
  ): Promise<string> {
    const program = await this.loadProgram();
    const pool = await this.getPool(args.pool);
    const [vaultA] = deriveVaultAPda(args.pool, this.programId);
    const [vaultB] = deriveVaultBPda(args.pool, this.programId);
    const userTokenA = getAssociatedTokenAddressSync(pool.tokenAMint, this.wallet.publicKey);
    const userTokenB = getAssociatedTokenAddressSync(pool.tokenBMint, this.wallet.publicKey);

    try {
      const builder = (program.methods as Record<string, (...a: unknown[]) => {
        accounts: (a: Record<string, PublicKey>) => { rpc: () => Promise<string> };
      }>)[method]();
      return await builder
        .accounts({
          user: this.wallet.publicKey,
          pool: args.pool,
          vaultA,
          vaultB,
          userTokenA,
          userTokenB,
          bloom: args.bloom,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    } catch (e) {
      const wrapped = HanamiError.fromAnchor(e);
      throw wrapped ?? e;
    }
  }

  async getPool(pool: PublicKey): Promise<PoolState> {
    const program = await this.loadProgram();
    return (await (program.account as unknown as Record<string, { fetch: (k: PublicKey) => Promise<PoolState> }>).pool.fetch(pool));
  }

  async getBloom(bloom: PublicKey): Promise<BloomPositionState> {
    const program = await this.loadProgram();
    return (await (program.account as unknown as Record<string, { fetch: (k: PublicKey) => Promise<BloomPositionState> }>).bloomPosition.fetch(bloom));
  }

  async ensureUserAtas(pool: PublicKey): Promise<void> {
    const p = await this.getPool(pool);
    await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.wallet,
      p.tokenAMint,
      this.wallet.publicKey,
    );
    await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.wallet,
      p.tokenBMint,
      this.wallet.publicKey,
    );
  }
}
