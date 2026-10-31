# DFRNT Solar platform

Online solar and battery retailer, SEQ. Fixed installed prices, one contract, one price, one payment.
Spec of record: the build book (https://claude.ai/artifact/5ht5y6f9jAeSdSQeBRdGNM), split into `docs/spec/`.

## Layout
- `packages/engine` — pricing, configuration and rebate engine. Pure TypeScript, no IO. Every money rule lives here and nowhere else.
  - `src/data/*.json` — rules, component costs, labour menu, rebate schedule. Changing a number is a data change, not a code change.
  - `test/money.test.ts` — the book's money acceptance tests (#1002 figures). These gate every merge.
- `apps/web` — Next.js site, API and ops (Batch 2 onward).

## Rules the engine enforces
- Hardware/BOS sell = cost ÷ 0.75. Installation and variations sell = installer cost ÷ 0.9. Installer cost = menu ÷ 1.1.
- Discounts (inc GST) come off before GST. GST on the full pre-STC price. STCs off last at the fixed rate.
- Battery labour per stack: first stack + each additional stack. Never per module.
- Rebate lock = the earlier of 14 days or the end of the current schedule window; booking only offers dates inside it.

## Run
```
pnpm install
pnpm test
```
