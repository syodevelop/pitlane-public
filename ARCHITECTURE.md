# Architecture

## Browser

React and TypeScript render the landing page, Docs, whitelist and game interface. Three.js renders the workshop and its characters, cars and equipment. Vite builds the application and prerenders the public content pages. Game and wallet libraries load separately from the landing page.

`packages/workshop-core` contains the current workshop rules. `src/WorkshopGame.tsx` connects them to movement, animation, the HUD and saves. The browser runs the simulation, including service progress and Credits/REP. The older game modules remain in the tree but do not drive the current `/play` screen.

## Wallet entry and saves

1. The Worker issues a sign-in challenge.
2. The wallet signs a SIWE message. The server verifies the signature, nonce, domain and account.
3. The first authenticated visit selects a permanent character.
4. The account's SQLite Durable Object stores the workshop state. Subsequent visits restore that state.
5. The server issues one active writer per account. Save revisions and idempotent retries prevent older tabs from overwriting a newer session.

The game saves periodically and on exit. Failed saves pause play for retry. Browser unload requests are best-effort, so the last few seconds can be lost if a browser or device closes abruptly. The server caps reported active time against elapsed server time.

Wallet ownership checks and save validation do not make the client simulation cheat-proof. A future token-reward system needs authoritative validation of reward-producing actions and independent funded-balance accounting.

## Storage and administration

Durable Objects hold account saves. D1 holds a searchable projection of player statistics, whitelist applications, campaign settings and admin sign-in throttling. The admin authenticates with a password verifier stored as a Worker secret. Its cookie is HttpOnly and expires; a hidden route is not the access control.

The public configuration uses `/local-admin` as an example route. Run `npm run admin:password` to prepare your own local password verifier. Keep `.dev.vars`, `.wrangler/` and database exports out of version control.

## Publication

The owner's deployment configuration and automatic publication hook are excluded. To host a separate installation, configure your own Worker, Durable Object namespace, D1 database, origin and secrets. Apply the migrations to your own database before serving requests. A static upload alone cannot run the authenticated game or persist whitelist applications.

WalletConnect remains disabled without a configured project ID. Browser-injected wallets and mobile wallet browsers provide the supported sign-in path in this snapshot. No private keys or seed phrases are required by the application.
