# Walk the Planck

Walk the Planck is a browser-based, on-chain social deduction game built for EVM-compatible networks that support Pyth Entropy. This repository contains the web client, matchmaking backend, session handling, and real-time queue updates that bridge the frontend to the deployed `WalkThePlanck` smart contracts.

The app combines a static frontend with a lightweight PHP/MySQL backend. Players connect a wallet, join one or more matchmaking buckets, receive live queue updates, and board eligible matches on-chain when a crew is ready.

## Stack

- Frontend: HTML, CSS, JavaScript
- Blockchain: EVM-compatible chains with Pyth Entropy support
- Contracts: Solidity, Hardhat
- Wallet / chain utilities: `@ohlabs/js-chain`
- Backend: PHP
- Database: MySQL
- Hosting: SiteGround

## Highlights

- Wallet-aware matchmaking UI with deployment-aware chain gating
- Multi-bucket queueing by player count and entry fee
- Live queue updates over Server-Sent Events
- On-chain match join, ship log, claim, and refund flows
- Session-based matchmaking persistence across reloads
- Progressive Ship Log loading with per-row placeholders
- Automatic recovery on chain switch via toast + page reload

## How It Works

1. The frontend initializes wallet, playback, tutorial, and matchmaking flows from [main.js](./main.js).
2. A session token is created in local storage and used to associate a browser session with queue preferences.
3. Queue choices are persisted in MySQL through the PHP API in [api/](./api).
4. The frontend listens to matchmaking events from [api/stream_events.php](./api/stream_events.php) to keep queue counts in sync.
5. When a match is ready, the player commits on-chain through the `WalkThePlanck` contract helper in [features/matchmaking/walk-the-planck-contract.js](./features/matchmaking/walk-the-planck-contract.js).
6. After a successful on-chain join, queue preferences are cleared locally and in the backend so other players see updated counts immediately.

## Project Structure

```text
.
|-- api/                     PHP endpoints for sessions, queueing, SSE, and match sync
|-- db/                      SQL assets
|-- features/
|   |-- matchmaking/         Matchmaking controller + contract integration
|   |-- playback/            Replay / playback UI
|   `-- tutorial/            Tutorial flow
|-- state/                   Client-side shared state
|-- ui/                      DOM references and render helpers
|-- main.js                  App entry point
|-- matchmaking.js           Matchmaking refresh / ship log orchestration
|-- queue.js                 Queue syncing and truth-up logic
|-- session.js               Browser session token management
`-- style.css                App styling
```

## Local Setup

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Configure the PHP backend

This app expects a PHP host with MySQL available. Update your local database connection settings in `api/db.php` for your own environment.

Suggested local stack options:

- SiteGround staging
- XAMPP
- Laragon
- MAMP

### 3. Create the required database tables

Import the SQL assets in [db/](./db). Additional tables used by the API may need to be created from your latest local schema if they are not yet checked into this repo.

### 4. Serve the app through PHP

Because the frontend depends on PHP API routes and SSE, this project should be served from a PHP-capable web server rather than opened directly from the filesystem.

## Wallet and Network Notes

- The game is designed for EVM chains where Pyth Entropy is available.
- This web deployment currently gates users to the chains where `WalkThePlanck` has been published.
- The app detects unsupported chains and disables chain-dependent actions until the wallet is switched.
- If the wallet chain changes after initialization, the app shows a toast and reloads to avoid stale provider state.
- Current contract availability depends on published `WalkThePlanck` deployments in the linked contract metadata.

## Matchmaking Notes

- Queue preferences are tied to both wallet address and session token.
- Players can queue for multiple match sizes and fee tiers at once.
- When a player joins a match on-chain, all of that session's queued matchmaking buckets are cleared.
- Queue removals are broadcast so other connected players see counts update in real time.

## Deployment

This repo is intended to be deployed to a PHP/MySQL host such as SiteGround.

Deployment checklist:

- Upload the frontend assets
- Deploy the `api/` PHP endpoints
- Configure `api/db.php` for the target database
- Import the required MySQL schema
- Confirm wallet connectivity on the intended network
- Confirm SSE works on the target host

## Contracts

This repository is the web app and matchmaking layer. Contract authoring, compilation, and deployment live in the separate Hardhat repository:

- `hardhat-walk-the-planck`

Make sure the published contract metadata used by this app matches the currently deployed contract addresses.

## Submission Notes

- Frontend: HTML, CSS, JavaScript
- Backend: PHP, MySQL
- Smart contracts: Solidity, Hardhat
- Blockchain: EVM-compatible chains with Pyth Entropy support
- Hosting: SiteGround

## License

This project is licensed under the terms in [LICENSE](./LICENSE).
