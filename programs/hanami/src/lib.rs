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

        let fee_bps = pool.fee_bps as u128;
        let amount_in_128 = amount_in as u128;
        let fee_amount = amount_in_128
            .checked_mul(fee_bps)
            .ok_or(HanamiError::MathOverflow)?
            / BPS_DENOMINATOR;
        let amount_in_after_fee = amount_in_128
            .checked_sub(fee_amount)
            .ok_or(HanamiError::MathOverflow)?;

        let (reserve_in, reserve_out) = if a_to_b {
            (pool.reserve_a as u128, pool.reserve_b as u128)
        } else {
            (pool.reserve_b as u128, pool.reserve_a as u128)
        };

        let new_reserve_in_after_fee = reserve_in
            .checked_add(amount_in_after_fee)
            .ok_or(HanamiError::MathOverflow)?;
        let amount_out_128 = reserve_out
            .checked_mul(amount_in_after_fee)
            .ok_or(HanamiError::MathOverflow)?
            / new_reserve_in_after_fee;
        let amount_out: u64 = amount_out_128
            .try_into()
            .map_err(|_| HanamiError::MathOverflow)?;
        require!(amount_out >= min_out, HanamiError::SlippageExceeded);
        require!(amount_out < reserve_out as u64, HanamiError::InsufficientLiquidity);

        let (user_src, user_dst, vault_in, vault_out) = if a_to_b {
            (
                &ctx.accounts.user_token_a,
                &ctx.accounts.user_token_b,
                &ctx.accounts.vault_a,
                &ctx.accounts.vault_b,
            )
        } else {
            (
                &ctx.accounts.user_token_b,
                &ctx.accounts.user_token_a,
                &ctx.accounts.vault_b,
                &ctx.accounts.vault_a,
            )
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: user_src.to_account_info(),
                    to: vault_in.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_in,
        )?;

        let token_a_mint = pool.token_a_mint;
        let token_b_mint = pool.token_b_mint;
        let pool_bump = pool.bump;
        let seeds: &[&[u8]] = &[
            POOL_SEED,
            token_a_mint.as_ref(),
            token_b_mint.as_ref(),
            &[pool_bump],
        ];
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: vault_out.to_account_info(),
                    to: user_dst.to_account_info(),
                    authority: pool.to_account_info(),
                },
                signer_seeds,
            ),
            amount_out,
        )?;

        let amount_in_after_fee_u64: u64 = amount_in_after_fee
            .try_into()
            .map_err(|_| HanamiError::MathOverflow)?;

        if a_to_b {
            pool.reserve_a = pool
                .reserve_a
                .checked_add(amount_in_after_fee_u64)
                .ok_or(HanamiError::MathOverflow)?;
            pool.reserve_b = pool
                .reserve_b
                .checked_sub(amount_out)
                .ok_or(HanamiError::MathOverflow)?;
            if pool.total_liquidity > 0 {
                let add = fee_amount
                    .checked_shl(64)
                    .ok_or(HanamiError::MathOverflow)?
                    / pool.total_liquidity;
                pool.cumulative_fee_per_share_a = pool
                    .cumulative_fee_per_share_a
                    .checked_add(add)
                    .ok_or(HanamiError::MathOverflow)?;
            }
            pool.total_fees_a = pool
                .total_fees_a
                .checked_add(fee_amount as u64)
                .ok_or(HanamiError::MathOverflow)?;
        } else {
            pool.reserve_b = pool
                .reserve_b
                .checked_add(amount_in_after_fee_u64)
                .ok_or(HanamiError::MathOverflow)?;
            pool.reserve_a = pool
                .reserve_a
                .checked_sub(amount_out)
                .ok_or(HanamiError::MathOverflow)?;
            if pool.total_liquidity > 0 {
                let add = fee_amount
                    .checked_shl(64)
                    .ok_or(HanamiError::MathOverflow)?
                    / pool.total_liquidity;
                pool.cumulative_fee_per_share_b = pool
                    .cumulative_fee_per_share_b
                    .checked_add(add)
                    .ok_or(HanamiError::MathOverflow)?;
            }
            pool.total_fees_b = pool
                .total_fees_b
                .checked_add(fee_amount as u64)
                .ok_or(HanamiError::MathOverflow)?;
        }

        emit!(Swapped {
            pool: pool.key(),
            amount_in,
            amount_out,
            a_to_b,
            fee: fee_amount as u64,
        });
        Ok(())
    }

    pub fn settle_bloom(ctx: Context<SettleBloomCtx>) -> Result<()> {
        let clock = Clock::get()?;
        {
            let bloom = &ctx.accounts.bloom;
            require!(!bloom.settled, HanamiError::AlreadySettled);
            require!(clock.slot >= bloom.end_slot, HanamiError::BloomNotMatured);
        }
        execute_settle(ctx, false)
    }

    pub fn chirigiwa(ctx: Context<SettleBloomCtx>) -> Result<()> {
        let clock = Clock::get()?;
        {
            let bloom = &ctx.accounts.bloom;
            require!(!bloom.settled, HanamiError::AlreadySettled);
            require!(clock.slot < bloom.end_slot, HanamiError::AlreadyMatured);
        }
        execute_settle(ctx, true)
    }
}

fn execute_settle(ctx: Context<SettleBloomCtx>, early: bool) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let bloom = &mut ctx.accounts.bloom;

    require_keys_eq!(bloom.pool, pool.key(), HanamiError::PoolMismatch);
    require_keys_eq!(
        bloom.owner,
        ctx.accounts.user.key(),
        HanamiError::Unauthorized
    );

    let total_liq = pool.total_liquidity;
    require!(total_liq > 0, HanamiError::NoLiquidity);

    let share_a = (pool.reserve_a as u128)
        .checked_mul(bloom.liquidity)
        .ok_or(HanamiError::MathOverflow)?
        / total_liq;
    let share_b = (pool.reserve_b as u128)
        .checked_mul(bloom.liquidity)
        .ok_or(HanamiError::MathOverflow)?
        / total_liq;

    let fee_delta_a = pool
        .cumulative_fee_per_share_a
        .saturating_sub(bloom.entry_cumulative_fee_a);
    let fee_delta_b = pool
        .cumulative_fee_per_share_b
        .saturating_sub(bloom.entry_cumulative_fee_b);
    let fees_earned_a = fee_delta_a
        .checked_mul(bloom.liquidity)
        .ok_or(HanamiError::MathOverflow)?
        >> 64;
    let fees_earned_b = fee_delta_b
        .checked_mul(bloom.liquidity)
        .ok_or(HanamiError::MathOverflow)?
        >> 64;

    let (final_a_u128, final_b_u128, penalty_a, penalty_b) = if early {
        let principal_a = share_a;
        let principal_b = share_b;
        let pa = principal_a
            .checked_mul(CHIRIGIWA_PENALTY_BPS)
            .ok_or(HanamiError::MathOverflow)?
            / BPS_DENOMINATOR;
        let pb = principal_b
            .checked_mul(CHIRIGIWA_PENALTY_BPS)
            .ok_or(HanamiError::MathOverflow)?
            / BPS_DENOMINATOR;
        (
            principal_a.saturating_sub(pa) + fees_earned_a,
            principal_b.saturating_sub(pb) + fees_earned_b,
            pa,
            pb,
        )
    } else {
        (share_a + fees_earned_a, share_b + fees_earned_b, 0, 0)
    };

    let withdraw_a: u64 = final_a_u128
        .try_into()
        .map_err(|_| HanamiError::MathOverflow)?;
    let withdraw_b: u64 = final_b_u128
        .try_into()
        .map_err(|_| HanamiError::MathOverflow)?;

    let reserve_reduction_a = share_a.saturating_sub(penalty_a);
    let reserve_reduction_b = share_b.saturating_sub(penalty_b);

    pool.reserve_a = (pool.reserve_a as u128)
        .saturating_sub(reserve_reduction_a) as u64;
    pool.reserve_b = (pool.reserve_b as u128)
        .saturating_sub(reserve_reduction_b) as u64;
    pool.total_liquidity = pool
        .total_liquidity
        .checked_sub(bloom.liquidity)
        .ok_or(HanamiError::MathOverflow)?;
    pool.active_blooms = pool.active_blooms.saturating_sub(1);

    let token_a_mint = pool.token_a_mint;
    let token_b_mint = pool.token_b_mint;
    let pool_bump = pool.bump;
    let seeds: &[&[u8]] = &[
        POOL_SEED,
        token_a_mint.as_ref(),
        token_b_mint.as_ref(),
        &[pool_bump],
    ];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    if withdraw_a > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_a.to_account_info(),
                    to: ctx.accounts.user_token_a.to_account_info(),
                    authority: pool.to_account_info(),
                },
                signer_seeds,
            ),
            withdraw_a,
        )?;
    }
    if withdraw_b > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault_b.to_account_info(),
                    to: ctx.accounts.user_token_b.to_account_info(),
                    authority: pool.to_account_info(),
                },
                signer_seeds,
            ),
            withdraw_b,
        )?;
    }

    bloom.settled = true;

    let clock = Clock::get()?;
    emit!(BloomSettled {
        bloom: bloom.key(),
        owner: bloom.owner,
        early,
        withdraw_a,
        withdraw_b,
        fees_earned_a: fees_earned_a as u64,
        fees_earned_b: fees_earned_b as u64,
        penalty_a: penalty_a as u64,
        penalty_b: penalty_b as u64,
        settled_slot: clock.slot,
    });
    Ok(())
}

fn isqrt(n: u128) -> u128 {
    if n < 2 {
        return n;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub token_a_mint: Box<Account<'info, Mint>>,
    pub token_b_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = authority,
        space = 8 + Pool::LEN,
        seeds = [POOL_SEED, token_a_mint.key().as_ref(), token_b_mint.key().as_ref()],
        bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        init,
        payer = authority,
        token::mint = token_a_mint,
        token::authority = pool,
        seeds = [VAULT_A_SEED, pool.key().as_ref()],
        bump,
    )]
    pub vault_a: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = authority,
        token::mint = token_b_mint,
        token::authority = pool,
        seeds = [VAULT_B_SEED, pool.key().as_ref()],
        bump,
    )]
    pub vault_b: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(nonce: u64, amount_a: u64, amount_b: u64, duration_slots: u64)]
pub struct CreateBloom<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.token_a_mint.as_ref(), pool.token_b_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        seeds = [VAULT_A_SEED, pool.key().as_ref()],
        bump,
        constraint = vault_a.key() == pool.vault_a @ HanamiError::InvalidVault,
    )]
    pub vault_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_B_SEED, pool.key().as_ref()],
        bump,
        constraint = vault_b.key() == pool.vault_b @ HanamiError::InvalidVault,
    )]
    pub vault_b: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_token_a.mint == pool.token_a_mint @ HanamiError::InvalidMint,
        constraint = user_token_a.owner == user.key() @ HanamiError::Unauthorized,
    )]
    pub user_token_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_token_b.mint == pool.token_b_mint @ HanamiError::InvalidMint,
        constraint = user_token_b.owner == user.key() @ HanamiError::Unauthorized,
    )]
    pub user_token_b: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = user,
        space = 8 + BloomPosition::LEN,
        seeds = [BLOOM_SEED, pool.key().as_ref(), user.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub bloom: Box<Account<'info, BloomPosition>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SwapCtx<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.token_a_mint.as_ref(), pool.token_b_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        seeds = [VAULT_A_SEED, pool.key().as_ref()],
        bump,
        constraint = vault_a.key() == pool.vault_a @ HanamiError::InvalidVault,
    )]
    pub vault_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_B_SEED, pool.key().as_ref()],
        bump,
        constraint = vault_b.key() == pool.vault_b @ HanamiError::InvalidVault,
    )]
    pub vault_b: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_token_a.mint == pool.token_a_mint @ HanamiError::InvalidMint,
        constraint = user_token_a.owner == user.key() @ HanamiError::Unauthorized,
    )]
    pub user_token_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_token_b.mint == pool.token_b_mint @ HanamiError::InvalidMint,
        constraint = user_token_b.owner == user.key() @ HanamiError::Unauthorized,
    )]
    pub user_token_b: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SettleBloomCtx<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.token_a_mint.as_ref(), pool.token_b_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        mut,
        seeds = [VAULT_A_SEED, pool.key().as_ref()],
        bump,
        constraint = vault_a.key() == pool.vault_a @ HanamiError::InvalidVault,
    )]
    pub vault_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_B_SEED, pool.key().as_ref()],
        bump,
        constraint = vault_b.key() == pool.vault_b @ HanamiError::InvalidVault,
    )]
    pub vault_b: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_token_a.mint == pool.token_a_mint @ HanamiError::InvalidMint,
        constraint = user_token_a.owner == user.key() @ HanamiError::Unauthorized,
    )]
    pub user_token_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = user_token_b.mint == pool.token_b_mint @ HanamiError::InvalidMint,
        constraint = user_token_b.owner == user.key() @ HanamiError::Unauthorized,
    )]
    pub user_token_b: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = bloom.owner == user.key() @ HanamiError::Unauthorized,
        constraint = bloom.pool == pool.key() @ HanamiError::PoolMismatch,
    )]
    pub bloom: Box<Account<'info, BloomPosition>>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Pool {
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub vault_a: Pubkey,
    pub vault_b: Pubkey,
    pub reserve_a: u64,
    pub reserve_b: u64,
    pub total_liquidity: u128,
    pub cumulative_fee_per_share_a: u128,
    pub cumulative_fee_per_share_b: u128,
    pub total_fees_a: u64,
    pub total_fees_b: u64,
    pub active_blooms: u64,
    pub fee_bps: u16,
    pub bump: u8,
}

impl Pool {
    pub const LEN: usize = 32 + 32 + 32 + 32
        + 8 + 8
        + 16 + 16 + 16
        + 8 + 8 + 8
        + 2 + 1
        + 32;
}

#[account]
pub struct BloomPosition {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub liquidity: u128,
    pub start_slot: u64,
    pub end_slot: u64,
    pub entry_cumulative_fee_a: u128,
    pub entry_cumulative_fee_b: u128,
    pub deposited_a: u64,
    pub deposited_b: u64,
    pub entry_price: u128,
    pub nonce: u64,
    pub settled: bool,
    pub bump: u8,
}

impl BloomPosition {
    pub const LEN: usize = 32 + 32
        + 16
        + 8 + 8
        + 16 + 16
        + 8 + 8
        + 16
        + 8
        + 1 + 1
        + 16;
}

#[event]
pub struct PoolInitialized {
    pub pool: Pubkey,
    pub token_a: Pubkey,
    pub token_b: Pubkey,
    pub fee_bps: u16,
}

