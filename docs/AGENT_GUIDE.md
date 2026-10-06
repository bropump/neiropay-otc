# Agent quickstart

Build, run, and maintain [NEIRO OTC](https://otc.neiropay.app) from `bropump/neiropay-otc`.

## 1. Get the code

Use Node.js 22+ and GitHub CLI authenticated as **bropump**:

```sh
gh auth status
gh repo clone bropump/neiropay-otc
cd neiropay-otc
npm ci
```

Read `AGENTS.md` before editing. This repository is private. The production Cloudflare account, Worker, domain, and D1 database are already configured in `wrangler.jsonc`; their IDs are identifiers, not credentials.

## 2. Configure locally

```sh
cp .env.example .env.local
cp .dev.vars.example .dev.vars
chmod 600 .env.local .dev.vars
```

Fill these files using the owner's existing credentials. Do not paste credentials into chat, commits, screenshots, or logs.

| File | Setting | Value |
| --- | --- | --- |
| `.env.local` | `VITE_REOWN_PROJECT_ID` | Existing public Reown project ID; allow the development and production origins in Reown |
| `.dev.vars` | `RPC_URL` | Solana mainnet RPC URL; may contain a private API key |
| `.dev.vars` | `SETTLEMENT_SECRET` | Dedicated Solana authority's 64-byte secret key as a JSON array, on one line |

For this production app, obtain the **existing** settlement key from the owner-managed secure backup. The public authority is `C5EBwj45AJtcpKSWQ46st1ALLvf8yh5nW1g4fy3mcvYv`. Neither GitHub nor the frontend contains its secret. Cloudflare does not provide a way to read back an uploaded Worker secret.

**Do not generate a replacement for an ordinary redeploy.** Existing trades are bound to the original authority, and this app validates against that authority. Retain a secure backup outside Git and a recovery plan before changing it.

## 3. Run it

Build once so Wrangler can serve the asset directory, then initialize local D1:

```sh
npm run build
npx wrangler d1 execute neiropay-otc --local --file worker/schema.sql
```

Run these in separate terminals:

```sh
# Terminal 1: API, local D1, and settlement signer
npx wrangler dev --port 8788
```

```sh
# Terminal 2: frontend with hot reload
npm run dev
```

Open **http://127.0.0.1:5178**. Vite forwards `/api` to port 8788.

**Local hosting still uses mainnet when `RPC_URL` points to mainnet.** Wallet approval can move real funds. A local server is not a sandbox blockchain.

## 4. Check changes

```sh
npm test
npx tsc --noEmit
npm run build
```

Check the layout on desktop and mobile, token selection, trade review, wallet picker, and Orb links. Do not sign a mainnet transaction just to test the UI.

For transaction integration tests, install [Surfpool](https://github.com/txtx/surfpool) from its official distribution and start a mainnet fork in another terminal:

```sh
surfpool start --network mainnet --port 18899 --ws-port 18900 --no-deploy --no-tui --no-studio
```

Then run:

```sh
npx tsx tests/integration.ts
```

The test is hardcoded to that loopback RPC, generates disposable wallets, and supplies simulated balances through Surfpool's RPC. It exercises the deployed DvP program copied into the local fork. It does not load `.dev.vars` or use the production settlement key. A healthy mainnet datasource is needed to clone program/token accounts; set `SURFPOOL_DATASOURCE_RPC_URL` through a secure environment loader and omit `--network mainnet` when using a private datasource. Keep Surfpool logs private because upstream errors can include its URL. `tests/integration-results.json` contains local-fork evidence, not mainnet receipts.

## 5. Deploy the existing app to Cloudflare

Check the active account before changing anything:

```sh
npx wrangler whoami
```

Expected account ID: `cecaeb19be498963214448db6dfc77fa`. Worker: `neiropay-otc`. Domain: `otc.neiropay.app`.

The production Worker already has `RPC_URL` and `SETTLEMENT_SECRET`. Ordinary code deployments retain them; **do not overwrite them**. Confirm names without displaying values:

```sh
npx wrangler secret list
```

Deploy after the tests pass and the requested change is reviewed:

```sh
npm run deploy
curl --fail https://otc.neiropay.app/api/health
curl --fail https://otc.neiropay.app/api/config
```

Health should report `ok: true`, `network: "mainnet-beta"`, and `program: true`. `/api/config` exposes only public addresses; confirm the authority remains unchanged. Open the live site and check wallet-picker loading. No mainnet payment is needed for a deployment check.

The D1 schema is already installed. For a fresh database, initialize it with:

```sh
npx wrangler d1 execute neiropay-otc --remote --file worker/schema.sql
```

Do not substitute an unrelated existing app's Worker or database. Inspect and migrate any future schema change deliberately.

### Deploying a separate instance

Use a separate checkout and change the Worker name, Cloudflare account, custom domain, D1 name/ID, and rate-limit namespace in `wrangler.jsonc`. Create its database with `npx wrangler d1 create YOUR_DATABASE_NAME`, copy the returned ID into the config, and apply the schema to that database.

Provision a dedicated settlement key for that new instance in a secure key store; never reuse a trader's wallet key. The app expects a Solana keypair represented by a 64-byte JSON array. Keep a durable encrypted backup. Set the two Worker secrets with Wrangler's interactive prompts:

```sh
npx wrangler secret put RPC_URL
npx wrangler secret put SETTLEMENT_SECRET
```

Use the same authority for local configuration and the deployed Worker. Configure Reown for the new origin, build, deploy, and verify `/api/config`. Do not change the NEIRO, USDC, WSOL, or DvP addresses casually; this application is specifically configured for Solana mainnet.

## 6. Use the OTC desk

1. Connect a Solana wallet, choose **Sell NEIRO** or **Buy NEIRO**, and enter the NEIRO amount and **total** USDC/SOL payment.
2. Enter the other trader's exact wallet address and select an expiry. Review and sign trade creation. This pays network fees/account deposits; it does not deposit the trade amount.
3. Share the trade link. Both traders check the mint, amounts, wallet addresses, and expiry, then each signs their own deposit.
4. Deposits leave the wallets and enter program-controlled escrow. Either trader can reclaim their own deposit before settlement completes. Expiry does not automatically return funds.
5. Once both sides are funded, one trader requests settlement. The backend co-signs the agreed swap, and that trader signs and submits it as fee payer. Both token transfers succeed together or neither does.
6. View the finalized receipt on Orb. SOL payouts/refunds are **wrapped SOL**; the explicit action in **My trades** unwraps the connected wallet's entire WSOL account.

The service holds the settlement key, not user wallet keys. It cannot choose arbitrary payout recipients through this app's settlement path. User transactions still require wallet approval. Trade details are public on Solana even though the source repository is private.

## 7. Browser-agent use

The page exposes optional WebMCP tools on browsers that support them:

- `read_otc_trade`: reads the displayed form or verified trade ticket.
- `stage_otc_trade`: fills terms for review; it does not create a trade, sign, or move funds.

Discover the actual tool names from the current page; browser providers may append a generated suffix. Example staging arguments:

```json
{
  "side": "sell",
  "payment": "USDC",
  "neiro": "100000",
  "total": "50",
  "counterparty": "REPLACE_WITH_THE_USER_CONFIRMED_SOLANA_ADDRESS",
  "duration": 24
}
```

Use only terms and wallet addresses confirmed by the user. Hand wallet approvals and real-money actions to the human. Without WebMCP, use the visible form with the same boundaries.

## Where to edit

| Area | File |
| --- | --- |
| UI, ticket flow, browser-agent tools | `src/App.tsx` |
| Design and responsive layout | `src/style.css` |
| Reown wallet setup | `src/wallet.ts` |
| Exact amounts, account validation, instructions | `src/chain.ts` |
| API, transaction preparation, settlement signing | `worker/index.ts` |
| Trade snapshots and receipts | `worker/schema.sql` |
| Cloudflare resources and routing | `wrangler.jsonc` |

## Common problems

- **Wallet picker fails:** check the public Reown ID and allowed origin; rebuild after changing `.env.local`.
- **API unavailable locally:** build `dist`, initialize local D1, and run both terminals.
- **Settlement fails:** both escrows must be fully funded and the trade must still be within its settlement window; a withdrawal can invalidate a prepared settlement.
- **Authority mismatch:** restore the original configuration/key. Do not replace the authority to silence the error.
- **Domain unavailable just after first deployment:** check Wrangler's custom-domain result and public DNS, then the API health endpoint.

The application has not had an independent security audit. The recorded transaction tests used a local mainnet fork, not a real-money mainnet trade.
