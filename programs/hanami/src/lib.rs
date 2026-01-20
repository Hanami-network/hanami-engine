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

    pub fn create_bloom(
        ctx: Context<CreateBloom>,
        nonce: u64,
        amount_a: u64,
        amount_b: u64,
        duration_slots: u64,
    ) -> Result<()> {
        let _ = nonce;
        require!(
            duration_slots >= MIN_BLOOM_SLOTS && duration_slots <= MAX_BLOOM_SLOTS,
            HanamiError::InvalidDuration
        );
        require!(amount_a > 0 && amount_b > 0, HanamiError::InvalidAmount);

        let pool = &mut ctx.accounts.pool;

        let liquidity: u128 = if pool.total_liquidity == 0 {
            let product = (amount_a as u128)
                .checked_mul(amount_b as u128)
                .ok_or(HanamiError::MathOverflow)?;
            isqrt(product)
        } else {
            let la = (amount_a as u128)
                .checked_mul(pool.total_liquidity)
                .ok_or(HanamiError::MathOverflow)?
                / (pool.reserve_a as u128);
            let lb = (amount_b as u128)
                .checked_mul(pool.total_liquidity)
                .ok_or(HanamiError::MathOverflow)?
                / (pool.reserve_b as u128);
            la.min(lb)
        };
        require!(liquidity > 0, HanamiError::InsufficientLiquidity);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_a.to_account_info(),
                    to: ctx.accounts.vault_a.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_a,
        )?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_b.to_account_info(),
                    to: ctx.accounts.vault_b.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_b,
        )?;

        pool.reserve_a = pool
            .reserve_a
            .checked_add(amount_a)
            .ok_or(HanamiError::MathOverflow)?;
        pool.reserve_b = pool
            .reserve_b
            .checked_add(amount_b)
            .ok_or(HanamiError::MathOverflow)?;
        pool.total_liquidity = pool
            .total_liquidity
            .checked_add(liquidity)
            .ok_or(HanamiError::MathOverflow)?;
        pool.active_blooms = pool
            .active_blooms
            .checked_add(1)
            .ok_or(HanamiError::MathOverflow)?;

        let clock = Clock::get()?;
        let bloom = &mut ctx.accounts.bloom;
        bloom.owner = ctx.accounts.user.key();
        bloom.pool = pool.key();
        bloom.liquidity = liquidity;
        bloom.start_slot = clock.slot;
        bloom.end_slot = clock
            .slot
            .checked_add(duration_slots)
            .ok_or(HanamiError::MathOverflow)?;
        bloom.entry_cumulative_fee_a = pool.cumulative_fee_per_share_a;
        bloom.entry_cumulative_fee_b = pool.cumulative_fee_per_share_b;
        bloom.deposited_a = amount_a;
        bloom.deposited_b = amount_b;
        bloom.entry_price = if amount_b > 0 {
            ((amount_a as u128) << 64)
                .checked_div(amount_b as u128)
                .unwrap_or(0)
        } else {
            0
        };
        bloom.settled = false;
        bloom.nonce = nonce;
        bloom.bump = ctx.bumps.bloom;

        emit!(BloomCreated {
            bloom: bloom.key(),
            owner: bloom.owner,
            pool: pool.key(),
            liquidity,
            start_slot: bloom.start_slot,
            end_slot: bloom.end_slot,
            deposited_a: amount_a,
            deposited_b: amount_b,
        });
        Ok(())
    }

    pub fn swap(
        ctx: Context<SwapCtx>,
        amount_in: u64,
        min_out: u64,
        a_to_b: bool,
    ) -> Result<()> {
        require!(amount_in > 0, HanamiError::InvalidAmount);
        let pool = &mut ctx.accounts.pool;
        require!(pool.total_liquidity > 0, HanamiError::NoLiquidity);

