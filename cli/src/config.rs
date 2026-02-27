use anyhow::{Context, Result};
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{read_keypair_file, Keypair};
use std::path::PathBuf;
use std::str::FromStr;

pub struct CliConfig {
    pub rpc: RpcClient,
    pub keypair: Keypair,
    pub program_id: Pubkey,
}

impl CliConfig {
    pub fn load(rpc_url: &str, keypair_path: &str, program_id: &str, commitment: &str) -> Result<Self> {
        let path = expand(keypair_path);
        let keypair = read_keypair_file(&path)
            .map_err(|e| anyhow::anyhow!("failed to read keypair {}: {}", path.display(), e))?;

        let commitment = match commitment {
            "processed" => CommitmentConfig::processed(),
            "finalized" => CommitmentConfig::finalized(),
            _ => CommitmentConfig::confirmed(),
        };

        let rpc = RpcClient::new_with_commitment(rpc_url.to_string(), commitment);
        let program_id = Pubkey::from_str(program_id).context("invalid program id")?;

        Ok(Self { rpc, keypair, program_id })
    }
}

fn expand(path: &str) -> PathBuf {
    let expanded = shellexpand::tilde(path);
    PathBuf::from(expanded.into_owned())
}
