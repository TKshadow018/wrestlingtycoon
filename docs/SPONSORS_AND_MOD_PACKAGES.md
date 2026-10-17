# Sponsors and Mod Packages

Sponsors are contracts with both cash value and brand-fit consequences. Mod packages let players import supported catalogs and free agents without editing source JSON directly.

## Sponsor types and capacity

Sponsor type slots are tracked separately. The current limits are:

| Sponsor type | Maximum active |
|---|---:|
| `title`, `ring`, `eventMain`, `eventMinor`, `experience`, `media` | 1 each |
| `dress`, `asset` | 3 each |
| `digital` | 5 |

`eventMain` and `eventMinor` are event-scoped, one-show sponsors. A qualifying event is PPV, Mega Live, or One Time; these sponsors require a qualifying booked event and are consumed after a qualifying event runs. Non-event-scoped sponsors have a contract duration and can pay recurring daily income. Active sponsors can also contribute event fan/gate bonuses on qualifying events.

Signing an offer pays its signing bonus immediately. Generated offers depend on catalog tier and staff ability; offers can be rerolled no more often than once every seven game days. Daily recurring payout is weighted by trust: `0.65 + trust / 200`, where trust is clamped to 0–100. Trust therefore changes the realized value of a deal, not just its display status.

## Brand fit, trust, and churn

Completed interviews and event results can raise or lower sponsor trust. Brand fit affects the trust response: professionalism is more favorable to Tech/Media/Luxury/Community brands; hype and some controversy can fit Combat/Entertainment/Performance brands; Lifestyle combines professionalism, hype, and controversy. Actual event scoring also considers brand safety, family audience share, violent-segment share, promo share, star power, risk, and overall rating.

Tier 6–7 offers require a recent event track record with brand-safety score at least 60 and family-audience share at least 18%. A high-tier sponsor whose trust falls to 12 or lower can exit after an event. The offer is not automatically valid merely because cash is available; slot and event/brand requirements must also pass.

The sponsor formulas and ledger flows live in [src/store/useGameStore.js](../src/store/useGameStore.js) and [src/data/sponsorOffers.js](../src/data/sponsorOffers.js). Financial impacts are summarized in [FINANCE_MONEY_SYSTEM.md](FINANCE_MONEY_SYSTEM.md), and interview-related trust changes in [AI_INTERVIEWS.md](AI_INTERVIEWS.md).

## Mod package format

The exported package is a JSON object with a `type`, `version`, `createdAt`, and `modules` object. The current export type is `wrestling-tycoon-mod-package`, version 1. Supported module arrays are:

- `titles`
- `sponsorOffers`
- `eventTemplates`
- `wrestlerArchetypes`
- `rosterData` (wrestler free agents)
- `venues`

Validation sanitizes numeric ranges and strings, removes duplicate IDs/keys, skips malformed entries with warnings, and rejects invalid package/module shapes or packages with no usable modules. Optional modules can be omitted to leave that category unchanged.

On import, title catalogs, sponsor offers, and event templates replace their corresponding lists when provided. Wrestler archetypes, mod wrestlers, and venues merge by their IDs. Mod wrestlers become hiring-market candidates after normalization; importing a wrestler does not hire them. A mod package does not directly modify active contracts, company cash, event history, or board state.

Important boundary: `eventTemplates` can be imported/exported and stored in the market, but the current event scheduling/resolution path is based on the built-in event-type configuration. Imported `productionScale`, `popularityWeight`, `hype`, and `risk` fields should not be described as changing live event outcomes unless the code is changed to consume them.

## Source and tests

- Package schema, export, and normalization: [src/utils/modDataPackage.js](../src/utils/modDataPackage.js).
- In-game import/merge behavior: [src/store/useGameStore.js](../src/store/useGameStore.js).
- Package tests: [src/utils/modDataPackage.test.js](../src/utils/modDataPackage.test.js).
- Sponsor offer generation: [src/data/sponsorOffers.js](../src/data/sponsorOffers.js) and [src/store/gameStoreActions.test.js](../src/store/gameStoreActions.test.js).