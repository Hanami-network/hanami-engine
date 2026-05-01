use anyhow::Result;
use clap::Parser;
use env_logger::Env;

mod commands;
mod config;
mod pda;

use commands::Command;
use config::CliConfig;

#[derive(Parser, Debug)]
#[command(
    name = "hanami-cli",
    version,
    about = "Command line client for the HANAMI on-chain liquidity primitive.",
    long_about = "Open, settle, and inspect time-bounded HANAMI bloom positions on Solana."
)]
struct Cli {
    #[arg(long, env = "HANAMI_RPC_URL", default_value = "https://api.devnet.solana.com")]
    rpc: String,

    #[arg(long, env = "HANAMI_KEYPAIR_PATH", default_value = "~/.config/solana/id.json")]
    keypair: String,

    #[arg(long, env = "HANAMI_PROGRAM_ID", default_value = "4YZuozjXWMmZTd1a35NyKQVYi9BoJJMr1L2aasTT9GQf")]
    program_id: String,

    #[arg(long, default_value = "confirmed")]
    commitment: String,

    #[command(subcommand)]
    command: Command,
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::Builder::from_env(Env::default().default_filter_or("info"))
        .format_timestamp(None)
        .init();

    let cli = Cli::parse();
    let cfg = CliConfig::load(&cli.rpc, &cli.keypair, &cli.program_id, &cli.commitment)?;
    cli.command.run(cfg).await?;
    Ok(())
}
