//! HANAMI (花見) - Ephemeral Bloom Liquidity
//!
//! Time-bounded LP positions with mathematically bounded impermanent loss.
//! A position blooms on deposit, accrues fees during its bloom window,
//! and falls (auto-settles) at end_slot. Early exit is permitted via
//! chirigiwa with a principal penalty that redistributes to remaining LPs.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer},
};

declare_id!("BeGzo6j9d6YPXXq93Y5mrnnGCyKPoVh2qQFD8Frnrsrn");

pub const POOL_SEED: &[u8] = b"pool";
pub const VAULT_A_SEED: &[u8] = b"vault_a";
pub const VAULT_B_SEED: &[u8] = b"vault_b";
pub const BLOOM_SEED: &[u8] = b"bloom";

pub const MIN_BLOOM_SLOTS: u64 = 10;
pub const MAX_BLOOM_SLOTS: u64 = 6_480_000;
pub const MAX_FEE_BPS: u16 = 1000;
pub const CHIRIGIWA_PENALTY_BPS: u128 = 500;
pub const BPS_DENOMINATOR: u128 = 10_000;
pub const Q64: u128 = 1u128 << 64;

#[program]
pub mod hanami {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, HanamiError::FeeTooHigh);
        let pool = &mut ctx.accounts.pool;
        pool.token_a_mint = ctx.accounts.token_a_mint.key();
        pool.token_b_mint = ctx.accounts.token_b_mint.key();
        pool.vault_a = ctx.accounts.vault_a.key();
        pool.vault_b = ctx.accounts.vault_b.key();
        pool.reserve_a = 0;
        pool.reserve_b = 0;
        pool.total_liquidity = 0;
        pool.cumulative_fee_per_share_a = 0;
        pool.cumulative_fee_per_share_b = 0;
        pool.total_fees_a = 0;
        pool.total_fees_b = 0;
        pool.active_blooms = 0;
        pool.fee_bps = fee_bps;
        pool.bump = ctx.bumps.pool;
        emit!(PoolInitialized {
            pool: pool.key(),
            token_a: pool.token_a_mint,
            token_b: pool.token_b_mint,
            fee_bps,
        });
        Ok(())
    }

