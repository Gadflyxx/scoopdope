# Contributing

Thanks for your interest in contributing! This guide covers branch naming, commit message conventions, and the pull request process.

## Branch naming

Create a branch off `main` using a short, descriptive name prefixed by the type of change:

- `feat/<short-description>` — new feature
- `fix/<short-description>` — bug fix
- `docs/<short-description>` — documentation only
- `refactor/<short-description>` — code change that neither fixes a bug nor adds a feature
- `test/<short-description>` — adding or updating tests
- `chore/<short-description>` — tooling, build, or maintenance work

Use lowercase words separated by hyphens, and reference the issue number when one exists, e.g. `fix/1069-contributing-guide`.

## Code style

This repository enforces a consistent code style across all files using `.editorconfig`, ESLint, and Prettier:

- `.editorconfig` configures editor indentation (2 spaces for JS/TS/JSON/YAML, 4 spaces for Rust, tabs for Makefile), UTF-8 charset, LF line endings, and trailing newline insertion.
- ESLint is configured via `eslint.config.js` and checks JavaScript/TypeScript sources for lint errors.
- Prettier is configured via `.prettierrc` (single quotes, 2 spaces indentation, 100 column print width, trailing commas) and ignores files listed in `.prettierignore`.

### Local linting and formatting

This project uses `pnpm` as its package manager. Install dependencies first:

```bash
pnpm install
```

Then use the following scripts:

- `pnpm lint` — runs ESLint over the codebase and reports any lint errors.
- `pnpm format` — auto-formats all files with Prettier, writing changes in place.
- `pnpm format:check` — checks formatting with Prettier without writing changes; exits non-zero if any file differs.

Before opening a pull request, run `pnpm lint` and `pnpm format:check` locally and fix any reported issues (use `pnpm format` to auto-fix formatting). CI runs both checks and **fails the build if any ESLint error or Prettier formatting diff is detected**, so commits must be clean before they can be merged.

### Pre-commit hook

The repository uses [husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/lint-staged/lint-staged) to run checks automatically before each commit. The hook is installed by `pnpm install` (via the `prepare` script) and runs ESLint and Prettier on staged files only. If a staged file has a lint error or a formatting diff, the commit is blocked — fix the issues (or run `pnpm format`) and commit again.

## Commit message conventions

This repository follows [Conventional Commits](https://www.conventionalcommits.org/). Each commit message should have the form:

```
<type>(<optional scope>): <short summary>

<optional body>

<optional footer>
```

Common types:

- `feat` — a new feature
- `fix` — a bug fix
- `docs` — documentation changes
- `refactor` — a code change that neither fixes a bug nor adds a feature
- `test` — adding or updating tests
- `chore` — tooling, build, or maintenance work

Guidelines:

- Keep the summary in the imperative mood and under ~72 characters (e.g. `fix: handle empty response body`).
- Use the body to explain *what* and *why*, not *how*.
- Reference issues in the footer, e.g. `Closes #1069`.
- Keep each commit focused on a single logical change.

## Pull request process

1. Fork the repository and create your branch from `main` using the naming convention above.
2. Make your changes, keeping commits focused and following the commit conventions.
3. Ensure the project builds and any relevant tests pass locally.
4. Open a pull request against `main` with a clear title and description.
   - Describe the problem and the approach taken.
   - Link the related issue(s) (e.g. `Closes #1069`).
   - Include screenshots or logs when they help reviewers.
5. Keep the pull request scoped to a single concern; split unrelated changes into separate PRs.
6. Address review feedback by pushing additional commits to the same branch.
7. Once approved and CI is green, a maintainer will merge the pull request.

## Smart Contract Development

The Soroban smart contracts live under `contracts/`. This section walks through setting up the Rust/Soroban toolchain, running the contract test suite, and deploying contracts to a local Stellar testnet. All commands below are verified on a clean Ubuntu 22.04 environment.

### Prerequisites

- **Rust 1.75 or newer.** Install or update via [rustup](https://rustup.rs/):

  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  source "$HOME/.cargo/env"
  rustc --version   # must report 1.75.0 or later
  ```

- **The `wasm32-unknown-unknown` target**, required to compile contracts to WebAssembly:

  ```bash
  rustup target add wasm32-unknown-unknown
  ```

- **The Stellar CLI** (which includes the Soroban tooling):

  ```bash
  cargo install --locked stellar-cli --features opt
  stellar --version
  ```

  Alternatively, install the Soroban CLI directly:

  ```bash
  cargo install --locked soroban-cli
  soroban --version
  ```

- **Docker**, used to run a local Stellar testnet (see below).

### Running contract tests

Each contract is its own Cargo package. Run the tests for a single contract from its directory:

```bash
cd contracts/<contract-name>
cargo test
```

Or run the entire contract test suite from the `contracts/` directory:

```bash
cd contracts
cargo test --all
```

### Building contracts

Build all contracts to optimized Wasm using the repository build script:

```bash
./scripts/build.sh
```

The resulting `.wasm` artifacts are written to the contracts' `target/wasm32-unknown-unknown/release/` directories.

### Deploying to a local Stellar testnet

Start a local Stellar network using the `stellar-quickstart` Docker image:

```bash
docker run --rm -it \
  --name stellar \
  -p 8000:8000 \
  stellar/quickstart:latest \
  --local
```

Once the container is running, configure the CLI to talk to it and deploy a contract:

```bash
stellar network add local \
  --rpc-url http://localhost:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017"

stellar keys generate --global alice --network local
stellar keys fund alice --network local

stellar contract deploy \
  --wasm contracts/<contract-name>/target/wasm32-unknown-unknown/release/<contract_name>.wasm \
  --source alice \
  --network local
```

### Further reading

- [Smart Contract Interaction Guide](docs/smart-contract-interaction-guide.md) — invoking deployed contracts from the backend and frontend.
- [Smart Contract Deployment](docs/smart-contract-deployment.md) — deployment targets, configuration, and operational details.

## Questions

If anything here is unclear, open an issue and we'll be happy to help.
