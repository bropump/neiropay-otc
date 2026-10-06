# Working on NEIRO OTC

Start with [the agent quickstart](docs/AGENT_GUIDE.md) and [README](README.md).

- GitHub owner is **bropump**, never `1of1pi` or `1o1pi`. Check `gh auth status` and the remote before pushing. Keep repository visibility private unless the owner explicitly changes it.
- Keep credentials out of Git, frontend code, logs, and chat. `.env.local`, `.dev.vars`, `.keys/`, keypair files, and `.wrangler/` are local only. Examples contain placeholders.
- Preserve the existing production settlement authority on redeploy. Open trades depend on it. Do not generate, rotate, or overwrite its key as routine setup.
- This app uses mainnet even when hosted locally unless the RPC is deliberately changed. Agents may inspect or stage trades; humans approve wallet signatures and real-money actions.
- Preserve exact integer amount handling, allowed mints, PDA/account-owner validation, fixed recipients, and client verification of prepared transaction messages.
- Run `npm test` and `npx tsc --noEmit` for code changes; build before deploying. Use the local Surfpool integration suite for transaction-flow changes, with generated test wallets only.
- Keep real SOL/USDC logos, Orb onchain links, and the existing design conventions.
- Do not add automatic production deployment workflows without an explicit request. The manual command is `npm run deploy`; confirm the expected Cloudflare account and keep existing secrets.
- Before committing, inspect staged files and check that no credential files, private RPC URLs, or key bytes are included. Use the repository-local bropump commit identity.
