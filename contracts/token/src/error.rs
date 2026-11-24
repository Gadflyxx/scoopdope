use soroban_sdk::contracterror;

/// Error codes returned by the token contract.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The contract has already been initialized.
    AlreadyInitialized = 1,
    /// The contract has not been initialized yet.
    NotInitialized = 2,
    /// The caller is not authorized to perform this action.
    Unauthorized = 3,
    /// The requested amount is invalid (e.g. negative or zero where not allowed).
    InvalidAmount = 4,
    /// The account does not have sufficient balance for this operation.
    InsufficientBalance = 5,
}
