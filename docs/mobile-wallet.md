# Wallet connection on mobile and desktop

Remain uses a **real EIP-1193 wallet provider**, not a demo account. It never asks for a recovery phrase, private key, password, or token approval during ordinary account discovery.

## Supported paths

1. **Wallet-enabled desktop browser**: Select an injected wallet from EIP-6963 announcements. If the browser only exposes legacy `window.ethereum`, the existing Connect button still works. Announced names are self-asserted; confirm the wallet and browser extension yourself.
2. **Wallet-app mobile browser**: Open Remain from the wallet's in-app DApp browser. Tap **Connect BSC wallet**, choose the available provider, and approve the account access prompt inside the wallet. This applies to compatible mobile wallets that expose an EIP-1193 provider on the DApp page.
3. **Standard mobile Chrome / Safari**: Tap Connect and, when no injected wallet is available, tap **Open in MetaMask** or **Open in Trust Wallet**. These HTTPS links reopen the **public Remain origin** in the wallet's own browser. Return to the wallet app browser and connect there. A wallet app handoff is *not* the same as a cross-app WalletConnect session.
4. **Multiple installed wallets**: Tap **Choose another wallet** and select one of the compatible providers announced to the page. The selected provider is used by the portfolio balance scanner and the separate, gated sale-review route.
5. **Wrong network**: Tap **Switch to BNB Smart Chain**. The wallet displays an explicit network-switch prompt for chain ID `0x38` (56). If that network is not configured or the wallet refuses the switch, configure BSC manually in your wallet. Switching networks does not sign a message or execute a trade.

## Security & limits

- No wallet access requests, chain switches, typed-data signatures or transactions occur on page load.
- Choosing a wallet stores only an in-memory provider reference. No wallet address is persisted or sent in a wallet-app deep link.
- The mobile handoff generates a **fixed public origin**: MetaMask's in-app browser handoff opens the homepage, and Trust Wallet's link targets the `#live` portfolio route. Existing page query parameters, hash fragments and user inputs are excluded. Deep-link hosts are the public MetaMask and Trust domains.
- A wallet's EIP-6963 `name` and `rdns` are self-declared, not proof that it is the authentic wallet. No externally supplied wallet icons or markup are rendered.
- Account, chain and token changes invalidate wallet and cached preview state. A successful connection is not proof of asset eligibility, an executable price or a completed trade.
- **Not yet included**: cross-app WalletConnect v2 QR-code / universal-link session pairing from ordinary mobile browsers or desktops with no wallet extension. For that, integrate a supported WalletConnect/Reown SDK, register a project ID, allow the required relay endpoints in the site's restrictive CSP, and test session recovery/disconnection on Android and iOS. Do not use a made-up QR code or claim pairing without a live session.
- **Also pending**: authorized Binance market service credentials and independent durable mainnet trade execution/settlement evidence.

See [Product realism audit](product-realism-audit.md) for detailed financial boundaries.
