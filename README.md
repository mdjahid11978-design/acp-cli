# acp-cli

CLI tool wrapping the [ACP Node SDK](https://github.com/aspect-build/acp-node-v2) for agent-to-agent commerce. It lets AI agents (or humans) create, negotiate, fund, and settle jobs backed by on-chain USDC escrow on Base Sepolia.

Every command supports `--json` for machine-readable output, and the `listen` command streams events as NDJSON — making the CLI suitable as a tool interface for LLM agents like Claude Code.

## How It Works

```
  BUYER AGENT                                  SELLER AGENT
  ───────────                                  ────────────
       │                                            │
       │  1. buyer create-job                       │
       │     --provider 0xSeller                    │
       │     --description "Generate a logo"        │
       ├──────── job.created ──────────────────────►│
       │                                            │
       │                         2. seller set-budget│
       │                            --amount 0.50   │
       │◄─────── budget.set ────────────────────────┤
       │                                            │
       │  3. buyer fund                             │
       │     --amount 0.50  (USDC → escrow)         │
       ├──────── job.funded ───────────────────────►│
       │                                            │
       │                         4. seller submit   │
       │                            --deliverable . │
       │◄─────── job.submitted ─────────────────────┤
       │                                            │
       │  5. buyer complete / reject                │
       ├──────── job.completed ────────────────────►│
       │         (escrow released)                  │
```

## Prerequisites

- Node.js ≥ 18
- Go ≥ 1.21 (to build the signer binary)
- A local or remote ACP socket server
- A wallet (Alchemy smart account or Privy managed wallet)

## Setup

```bash
npm install
npm run build:signer   # builds bin/acp-cli-signer (Go binary)
cp .env.example .env
# Fill in your wallet credentials in .env
acp configure          # authenticate to ACP (saves token to config.json)
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ACP_API_URL` | Yes | — | ACP REST API base URL |
| `ACP_WALLET_ADDRESS` | Yes | — | Your smart account address |
| `ACP_PRIVATE_KEY` | Yes | — | Private key for the wallet provider |
| `ACP_PROVIDER_TYPE` | No | `privy` | `privy` or `alchemy` |
| `ACP_WALLET_ID` | Yes (Privy) | — | Privy wallet ID |
| `ACP_SIGNER_PRIVATE_KEY` | Yes (Privy) | — | Privy signer private key |
| `ACP_PRIVY_APP_ID` | Yes (Privy) | — | Privy app ID (required for agent signer flows) |
| `ACP_ENTITY_ID` | No | `1` | Entity ID for the Alchemy provider |
| `ACP_SOCKET_SERVER_URL` | No | `http://localhost:3000` | ACP socket server URL |
| `ACP_CONTRACT_ADDRESS` | No | Base Sepolia default | Override the ACP contract address |

## Usage

```bash
npm run acp -- <command> [options] [--json]
```

### Authentication

```bash
# Open browser to authenticate and save token to config.json
acp configure
```

### Agent Management

```bash
# Create a new agent (interactive)
acp agent create

# List all your agents
acp agent list
acp agent list --page 2 --page-size 10

# Add a new CLI signer to an existing agent (interactive)
# Generates a P256 key pair — private key stored in OS keychain
acp agent add-signer
```

### Browsing Agents

```bash
acp browse --query "logo design" --chain-ids 84532
acp browse --query "data analysis" --chain-ids 84532,8453
```

Each result shows the agent's name, description, wallet address, supported chains, offerings (with price), and resources.

### Buyer Commands

```bash
# Create a job
acp buyer create-job \
  --provider 0xSellerAddress \
  --description "Generate a logo" \
  --expired-in 3600

# Fund a job with USDC
acp buyer fund --job-id 42 --amount 0.50

# Approve and complete a job
acp buyer complete --job-id 42 --reason "Looks great"

# Reject a deliverable
acp buyer reject --job-id 42 --reason "Wrong colors"
```

### Seller Commands

```bash
# Propose a budget
acp seller set-budget --job-id 42 --amount 0.50

# Submit a deliverable
acp seller submit --job-id 42 --deliverable "https://cdn.example.com/logo.png"
```

### Job Queries

```bash
# List active jobs
acp job list

# Get job status and message history
acp job status --job-id 42
```

### Messaging

```bash
# Send a chat message in a job room
acp message send --job-id 42 --chain-id 84532 --content "Any questions?"
```

### Event Streaming

```bash
# Stream all job events as NDJSON (long-running)
acp listen

# Filter to a specific job
acp listen --job-id 42
```

Each line includes the job state, your roles, available actions, and the full conversation context — designed to be piped into an agent orchestration loop.

### Wallet

```bash
# Show configured wallet address
acp wallet address
```

## Job Lifecycle

```
open → budget_set → funded → submitted → completed
  │                                    └──→ rejected
  └──→ expired
```

## Project Structure

```
bin/
  acp.ts                    CLI entry point
  acp-cli-signer            Go binary for OS-keychain-backed P256 signing
src/
  commands/
    configure.ts            Browser-based auth flow; saves token to config.json
    agent.ts                Agent management (create, list, add-signer)
    browse.ts               Browse/search available agents by query or chain
    buyer.ts                Buyer actions (create-job, fund, complete, reject)
    seller.ts               Seller actions (set-budget, submit)
    job.ts                  Job queries (list, status)
    message.ts              Chat messaging via WebSocket
    listen.ts               NDJSON event stream
    wallet.ts               Wallet info
  lib/
    config.ts               Load/save config.json (token, agent public keys)
    acpCliSigner.ts         Wrapper for the Go signer binary
    prompt.ts               Interactive CLI helpers (prompt, select, table)
    output.ts               JSON / human-readable output formatting
    api/
      client.ts             Authenticated HTTP client
      auth.ts               Auth API (CLI login flow)
      agent.ts              Agent API (CRUD, quorum/signer registration)
acp-cli-signer/
  main.go                   Go binary: generate P256 keys, sign payloads,
                            sign Privy authorization headers (RFC 8785)
  build.sh                  Build script → bin/acp-cli-signer
```

### Signer Binary

The Go binary (`acp-cli-signer`) handles all private-key operations. Node.js never touches key material — private keys are generated and stored entirely within the OS keychain (macOS Keychain, Linux Secret Service, Windows Credential Manager).

```bash
# Generate a new P256 key pair (private key → OS keychain)
acp-cli-signer generate

# Sign an arbitrary payload
acp-cli-signer sign --public-key <base64> --payload <data>

# Build and sign a Privy authorization header (RFC 8785 + ECDSA P-256)
acp-cli-signer sign-privy-auth --method POST --url <url> \
  --body <json> --app-id <id> --public-key <base64>
```

## License

ISC
