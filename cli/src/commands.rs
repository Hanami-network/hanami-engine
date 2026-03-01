use anyhow::Result;
use clap::Subcommand;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Signer;
use std::str::FromStr;

use crate::config::CliConfig;
use crate::pda::{bloom_pda, pool_pda, sort_mints, vault_a_pda, vault_b_pda};

#[derive(Subcommand, Debug)]
pub enum Command {
    InitPool {
        #[arg(long)]
        token_a: String,
        #[arg(long)]
        token_b: String,
        #[arg(long, default_value_t = 30)]
        fee_bps: u16,
    },
    Bloom {
        #[arg(long)]
        pool: String,
        #[arg(long)]
        amount_a: u64,
        #[arg(long)]
        amount_b: u64,
        #[arg(long)]
        duration_slots: u64,
        #[arg(long)]
        nonce: Option<u64>,
    },
    Swap {
        #[arg(long)]
        pool: String,
        #[arg(long)]
        amount_in: u64,
        #[arg(long, default_value_t = 0)]
        min_out: u64,
        #[arg(long)]
        a_to_b: bool,
    },
    Settle {
        #[arg(long)]
        pool: String,
        #[arg(long)]
        bloom: String,
    },
    Chirigiwa {
        #[arg(long)]
        pool: String,
        #[arg(long)]
        bloom: String,
    },
    Info {
        #[arg(long)]
        pool: Option<String>,
        #[arg(long)]
        bloom: Option<String>,
    },
}

impl Command {
    pub async fn run(self, cfg: CliConfig) -> Result<()> {
        match self {
            Command::InitPool { token_a, token_b, fee_bps } => {
                let a = Pubkey::from_str(&token_a)?;
                let b = Pubkey::from_str(&token_b)?;
                let (sa, sb) = sort_mints(a, b);
                let (pool, _) = pool_pda(&sa, &sb, &cfg.program_id);
                let (va, _) = vault_a_pda(&pool, &cfg.program_id);
                let (vb, _) = vault_b_pda(&pool, &cfg.program_id);
                println!("pool      = {}", pool);
                println!("vault_a   = {}", va);
                println!("vault_b   = {}", vb);
                println!("token_a   = {}", sa);
                println!("token_b   = {}", sb);
                println!("fee_bps   = {}", fee_bps);
                println!("note: actual init-pool tx submission requires the IDL; use the SDK or anchor CLI for now");
                Ok(())
            }
            Command::Bloom { pool, amount_a, amount_b, duration_slots, nonce } => {
                let pool = Pubkey::from_str(&pool)?;
                let nonce = nonce.unwrap_or_else(|| std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0));
                let (bloom, _) = bloom_pda(&pool, &cfg.keypair.pubkey(), nonce, &cfg.program_id);
                println!("planned bloom    = {}", bloom);
                println!("nonce            = {}", nonce);
                println!("amount_a         = {}", amount_a);
                println!("amount_b         = {}", amount_b);
                println!("duration_slots   = {}", duration_slots);
                Ok(())
            }
            Command::Swap { pool, amount_in, min_out, a_to_b } => {
                let pool = Pubkey::from_str(&pool)?;
                println!("swap on pool {}", pool);
                println!("  amount_in = {}", amount_in);
                println!("  min_out   = {}", min_out);
                println!("  direction = {}", if a_to_b { "A->B" } else { "B->A" });
                Ok(())
            }
            Command::Settle { pool, bloom } => {
                let pool = Pubkey::from_str(&pool)?;
                let bloom = Pubkey::from_str(&bloom)?;
                println!("settle bloom {} on pool {}", bloom, pool);
                Ok(())
            }
            Command::Chirigiwa { pool, bloom } => {
                let pool = Pubkey::from_str(&pool)?;
                let bloom = Pubkey::from_str(&bloom)?;
                println!("chirigiwa bloom {} on pool {}", bloom, pool);
                println!("  estimated penalty: 5% of principal");
                Ok(())
            }
            Command::Info { pool, bloom } => {
                if let Some(pool_str) = pool {
                    let pool = Pubkey::from_str(&pool_str)?;
                    let acct = cfg.rpc.get_account(&pool)?;
                    println!("pool {}", pool);
                    println!("  owner      = {}", acct.owner);
                    println!("  data_len   = {}", acct.data.len());
                    println!("  lamports   = {}", acct.lamports);
                }
                if let Some(bloom_str) = bloom {
                    let bloom = Pubkey::from_str(&bloom_str)?;
                    let acct = cfg.rpc.get_account(&bloom)?;
                    println!("bloom {}", bloom);
                    println!("  owner      = {}", acct.owner);
                    println!("  data_len   = {}", acct.data.len());
                    println!("  lamports   = {}", acct.lamports);
                }
                Ok(())
            }
        }
    }
}
