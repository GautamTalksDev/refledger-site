# Refledger public website (local-only until launch)

Astro static site for https://refledger.gautamkhosla.com

## Develop

```bash
cd ~/projects/refledger-site
npm ci
npm run dev
```

Open http://localhost:4321

## Build

```bash
npm run build
npm run preview
```

## Checks

```bash
npm test
npm run build
npm run check:copy
npm run check:size
npx playwright install chromium
npm run test:e2e
```

Data is shallow-cloned at build time from the public `GautamTalksDev/refledger` `data` and `main` branches into `.cache/` (no token). Nothing is deployed from this repo until the Oct 9 seal check.
