use solana_sdk::pubkey::Pubkey;

pub const POOL_SEED: &[u8] = b"pool";
pub const VAULT_A_SEED: &[u8] = b"vault_a";
pub const VAULT_B_SEED: &[u8] = b"vault_b";
pub const BLOOM_SEED: &[u8] = b"bloom";

pub fn sort_mints(a: Pubkey, b: Pubkey) -> (Pubkey, Pubkey) {
    if a.to_bytes() <= b.to_bytes() {
        (a, b)
    } else {
        (b, a)
    }
}

pub fn pool_pda(token_a: &Pubkey, token_b: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[POOL_SEED, token_a.as_ref(), token_b.as_ref()], program_id)
}

pub fn vault_a_pda(pool: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_A_SEED, pool.as_ref()], program_id)
}

pub fn vault_b_pda(pool: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_B_SEED, pool.as_ref()], program_id)
}

pub fn bloom_pda(pool: &Pubkey, owner: &Pubkey, nonce: u64, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[BLOOM_SEED, pool.as_ref(), owner.as_ref(), &nonce.to_le_bytes()],
        program_id,
    )
}
