# NEIRO OTC · NeiroPay

[Open the live desk](https://otc.neiropay.app) · [Agent quickstart: run, deploy, and trade](docs/AGENT_GUIDE.md)

Public source repository: `bropump/neiropay-otc`. Credentials and settlement keys are never stored here.

A bilateral OTC desk for NEIRO Bropump against USDC or SOL on Solana mainnet. Uses the existing Solana Foundation DvP program; no new smart contract or token is deployed.

## Trading

Connect through the existing Reown project, choose buy/sell, exact amounts, a counterparty and expiry, then review and sign creation. Creation pays network fees and account deposits but does not deposit tokens. Share the trade link; each party verifies the terms and funds its own escrow. Once both sides are funded, a participant requests settlement. The Worker constructs and co-signs only a permitted DvP settlement; the participant verifies the transaction, signs as fee payer, and submits it.

Either party can reclaim its own leg or cancel/refund the trade before settlement. Expiry does not automatically refund. Closed tickets provide onchain receipts and late-deposit recovery. SOL deposits are wrapped in escrow; payouts/refunds are WSOL. My trades has an explicit unwrap-all action for the connected wallet.

There is no public order book, but Solana records are public. D1 stores verified snapshots and finalized closure receipts. No user wallet keys are held by the service. No app trading fee is added. Users pay network fees and account deposits; DvP credits closed-account rent to the settlement operator on settlement, or the rejecting party on rejection. The interface discloses this.

## Addresses

- NEIRO: `CTg3ZgYx79zrE1MteDVkmkcGniiFrK1hJ6yiabropump` (6 decimals)
- USDC: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (6 decimals)
- WSOL: `So11111111111111111111111111111111111111112` (9 decimals)
- DvP: `dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq`
- Operator: returned by `/api/config` and displayed in the app.

Instruction account order/flags/encoding follow [solana-foundation/dvp](https://github.com/solana-foundation/dvp), commit `df9919ed02c25a93620e7f6820107c9050ce3b92`. `src/dvp-idl.json` is reduced from its IDL; MIT license is in `DVP-LICENSE`.

NEIRO logo is the existing NeiroPay asset at `https://images.bropump.com/neiro_logo_small.png`. SOL/USDC logos come from the official [Solana token list](https://github.com/solana-labs/token-list/tree/main/assets/mainnet) at their exact mint paths. All explorer links use Orb.

## Development and deployment

Node.js 22+, npm. Run `npm ci`, then `npm run build`.

`.env.local` contains the public `VITE_REOWN_PROJECT_ID`. `.dev.vars` contains `RPC_URL` and `SETTLEMENT_SECRET` (a JSON array of the dedicated 64-byte key). Both are ignored. **Preserve this settlement key for future deployments:** existing trades are bound to it. Never expose it in frontend variables or regenerate it during redeployment.

Initialize local D1 with `npx wrangler d1 execute neiropay-otc --local --file worker/schema.sql`. Run `npx wrangler dev --port 8788` and `npm run dev` (port 5178). Deploy with `npm run build` and `npx wrangler deploy`. The dedicated Worker, D1 and custom domain are in `wrangler.jsonc`. Existing NeiroPay apps are separate.

## Verification

- `npm test`: integer precision/range, spoofed account owner/size, redirected recipient and unsupported token/authority rejection.
- `npx tsx tests/integration.ts`: requires a local Surfpool mainnet fork on port 18899. Generated test wallets and simulated balances exercise the real deployed DvP program: USDC/SOL settlement, exact payouts, service co-signatures, finalized receipts, buy/sell direction, reclaim, cancel/refund, late-deposit recovery and invalid actions. Never run against a real-money network.
- `tests/integration-results.json`: local-fork evidence; its signatures are not mainnet transactions.
- Browser checks cover Reown, form direction/payment changes, logos, Orb links, and optional WebMCP read/stage tools. These tools do not sign or submit transactions.

The upstream program audit does not cover this new application. No real-money mainnet trade was executed during development.

## Live deployment

Published on 2026-10-06 at https://otc.neiropay.app. Cloudflare version `8f9aca5a-ff21-4e54-9f1f-8170dc31cb1f`. Verified custom-domain HTTPS and mainnet API health via Cloudflare IP, successful browser page load, Reown wallet picker, and mobile layout at 390px. No real-money mainnet trade was executed.
