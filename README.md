# Web3 Payment Hub

A crypto payment platform that lets anyone create a payment request, share a link, and get paid directly to their wallet, with the transaction verified on-chain before it's marked as paid.

Built as a full-stack Web3 project: React/TypeScript frontend, Node/Express backend, PostgreSQL (Supabase), and real on-chain verification via Viem against the Ethereum Sepolia testnet.

## What it does

1. A merchant connects a wallet and creates a payment request (description, amount, recipient address).
2. They share the generated payment link with a customer.
3. The customer opens the link, connects their own wallet, and pays. This triggers a real eth_sendTransaction through MetaMask.
4. The backend independently verifies the transaction on Sepolia (existence, success, correct recipient, correct amount, correct sender) before marking the request "Paid". It does not just trust the client's word.
5. The merchant's dashboard shows their payment requests, live from the database, scoped to their connected wallet.

## Tech stack

- Frontend: React, TypeScript, Vite, Viem, MetaMask integration
- Backend: Node.js, Express, pg, Viem
- Database: PostgreSQL via Supabase
- Blockchain: Ethereum Sepolia testnet, verified via an Alchemy RPC endpoint

## Architecture

1. Customer opens a payment link and connects their wallet.
2. Customer clicks Pay, which triggers a real eth_sendTransaction in MetaMask.
3. MetaMask returns a transaction hash to the frontend.
4. The frontend sends that hash to the backend.
5. The backend looks up the transaction directly on Sepolia via Viem and checks that it exists, succeeded, and that the recipient, amount, and sender all match the payment request.
6. Only if all checks pass does the backend update Supabase, marking the request as Paid.

## Security and reliability

- Parameterized SQL throughout, no injection risk
- Payments are verified on-chain before being marked Paid. The backend does not trust a client-supplied transaction hash at face value
- Rate limiting on the payment-confirmation endpoint
- CORS restricted to known origins
- Idempotent payment updates, so a repeated confirmation call cannot double-process
- Resilient to transient database connection errors, a network blip no longer crashes the server

## Known limitations (honest, by design)

This is an MVP demonstrating the core flow end to end, not a production payment processor. Deliberately out of scope for now:

- No merchant authentication yet. A connected wallet address currently doubles as a pseudo-account, used to scope the dashboard. Real merchant accounts and API keys are a planned next phase.
- ETH only. The token selector is intentionally limited to ETH; ERC-20 support such as USDC and USDT is designed for but not yet implemented.
- Single network. Currently Sepolia only. Multi-chain support such as Base, Polygon, and Arbitrum is a planned phase.
- The contracts folder contains an early exploration of an on-chain payment-registry smart contract, PaymentHub.sol. This is not currently integrated into the app. The live app uses direct wallet-to-wallet transfers with off-chain verification and tracking instead. Included here as a sign of direction for a possible future architecture, not as working functionality.

## Roadmap

- Phase 1 (done): Real ETH payments, on-chain verification, error handling
- Phase 2: ERC-20 token payments (USDC, USDT, LINK)
- Phase 3: Multi-chain support
- Phase 4: Full merchant dashboard (search, filters, analytics)
- Phase 5: Webhooks and notifications
- Phase 6: Merchant authentication and API keys
- Phase 7: Production deployment and monitoring
- Phase 8: Commercialization (subscriptions, fees, SDK)

## Running it locally

Backend:

cd backend
npm install
node src/server.js

Add a .env file inside backend/ containing DATABASE_URL and SEPOLIA_RPC_URL before running.

Frontend:

cd frontend
npm install
npm run dev

## Live demo

Coming soon. Deployment in progress.
