# Token Contract

Soroban token contract used to mint platform reward tokens.

## Minting Access Control

The `mint` function is restricted to the contract admin address. Any call to
`mint` from an address other than the admin returns `Error::Unauthorized`.

- The admin address is **not hardcoded**. It is set once at contract
  initialization via `initialize(env, admin)` and stored in contract storage.
- `mint` loads the stored admin and compares it against the caller
  (`require_auth` + address equality). Non-admin callers are rejected with
  `Error::Unauthorized`.
- Only the platform backend (the designated admin) should be able to mint
  reward tokens; this prevents arbitrary addresses from minting unlimited
  tokens and destroying the token's value.

### Admin Key Management Procedure

1. **Provisioning**: The platform backend keypair is generated and its public
   address is passed to `initialize` when the contract is deployed. The admin
   address is persisted in contract storage at that time.
2. **Storage**: The admin address lives in contract storage (not in source
   code), so it can be set per deployment/environment without code changes.
3. **Custody**: The admin secret key is held by the platform backend and must
   never be committed to the repository or embedded in client code. Minting is
   performed server-side by the backend signer only.
4. **Rotation**: To change the admin, redeploy/initialize with the new admin
   address following the platform's key rotation runbook. The old key should be
   retired after the new admin is active.
5. **Verification**: Confirm the configured admin matches the backend signer
   before enabling minting in production.

## Tests

Test coverage includes both paths:

- `mint` called from the admin address succeeds.
- `mint` called from a non-admin address returns `Error::Unauthorized`.
