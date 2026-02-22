# Feature Matrix

| Area | Capability | Module |
| --- | --- | --- |
| List | Create listing output with datum/payouts | `src/list.ts` |
| Buy | Spend listing, distribute payouts + marketplace fee | `src/buy.ts` |
| Buy with auth | Authorizer-assisted buy path | `src/buy.ts` |
| Update | Replace listing payouts by owner | `src/update.ts` |
| Withdraw | Return listed handle to owner | `src/withdraw.ts` |
| Deploy | Publish parameterized script + metadata | `src/deploy.ts` |
| Datum/redeemer codecs | Build/decode listing data and redeemers | `src/datum.ts`, `src/redeemer.ts` |
| CLI | Operator command entrypoint | `CLI/*` |
