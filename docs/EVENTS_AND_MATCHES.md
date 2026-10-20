# Events and Matches

Events are the main source of show-based fan, prestige, and gate effects. A custom event is a scheduled record; the player must still prepare and execute it for the simulator to create an outcome.

## Event schedule and types

The system weekly show is a five-segment Regular Weekly event on Fridays. The player can schedule custom events on supported dates. Custom event validation currently allows at most two custom events per calendar week, one PPV per month, one Mega Live event per year, three One Time events per year, and one Digital Only event per week. `regularWeekly` is not a bookable custom-event type.

| Event type | Maximum segments | One-time booking setup fee | Production cost when run (default) | Base hype / risk |
|---|---:|---:|---:|---:|
| Regular Weekly | 5 | $0 | $2,500 | 62 / 16 |
| House Show | 3 | $9,000 | $5,000 | 50 / 12 |
| Digital Only | 3 | $7,000 | $3,000 | 52 / 10 |
| PPV | 7 | $24,000 | $15,000 | 88 / 28 |
| One Time | 8 | $20,000 | $12,000 | 84 / 24 |
| Mega Live | 10 | $32,000 | $25,000 | 98 / 34 |

Booking fees are charged when a custom event is created or its type changes. Deleting a current/future event refunds 60% of its setup fee. Production cost is charged only when the event actually runs. Production-cost defaults come from `GAME_CONFIG.eventCost`; they can differ from setup fees and can be overridden. See [FINANCE_MONEY_SYSTEM.md](FINANCE_MONEY_SYSTEM.md).

The dashboard treats a due custom event as the show for that date; otherwise, a Friday has the Regular Weekly show. `proceedTimeline()` resolves a show only if it receives event setup/results for an event that is due. A missed or skipped date is not retroactively resolved by the existence of a booking.

## Card segments

The card builder creates a segment for each available slot. In the UI, every slot must be configured before execution.

| Segment | Primary use | Important inputs |
|---|---|---|
| `match` | Standard match | Wrestlers, singles/tag format, stipulation, referee. |
| `mainEvent` | Featured match | Same match inputs; announcer required. |
| `titleMatch` | Championship match | Same match inputs plus an eligible title; announcer optional. |
| `interview` | In-show interview segment | Wrestler/manager participant; announcer required. A wrestler may receive a random popularity change unless explicit changes are supplied. |
| `promo` | Character or faction story segment | Wrestler/manager participants, unlocked promo format, optional faction story beat. |

Match slots require at least two wrestlers; tag slots require a participant on both teams. Matches require a referee. Main events and interviews require an announcer. Wrestlers with stamina below 10 cannot be placed in a match. Managers can appear in interviews/promos, not as match wrestlers. The UI's selected match stipulation is recorded as card data; do not assume each stipulation has its own independent resolution algorithm.

## Match execution

For each match segment the player can simulate or plan it:

- **Simulate:** the winner is selected randomly. Match rating is based on average participant skill and stamina, plus a small random factor and the default finish/risk bonuses. A higher skill raises expected quality; it does not guarantee victory.
- **Plan:** the player chooses the winner, finish, and pace, then creates an ordered plan of timed moments. Match length can be set from 1 to 60 minutes. Each moment can assign an actor, an optional target, and an action such as strikes, kicks, an outside-the-ring brawl, a comeback, or a near fall.
- Props are a multi-select option. Supported props include chairs, tables, ladders, kendo sticks, steel steps, and the announce table. A prop must be selected for the match before a `usesProp` moment can use it.
- Ratings are clamped to 1–10. A more detailed plan and selected props improve the planned-match quality modifier, while match duration and the number of planned moments increase stamina cost. Each wrestler's base match stamina loss is randomized in the 20–50 range, with additional loss for risky/chaotic execution; daily stamina recovery is 10.
- Tag outcomes record the winning team. Singles outcomes record one winning wrestler. A title match applies the result to the configured title after validation.

The exact execution UI and payload are in [src/components/dashboard/modules/EventSetupModal.jsx](../src/components/dashboard/modules/EventSetupModal.jsx). The store sanitizes that payload against active employee IDs, event slot limits, allowed segment types, and current unlocks before applying results.

## What a successful event changes

The result aggregates multiple systems; no single stat alone determines success:

- **Attendance and gate:** event type supplies a configured audience range and ticket default. Current fans and prestige, configured weights, and a random crowd factor set attendance. Ticket revenue is adjusted by sponsors, board attendance, segment income bonuses, and audience spending fit.
- **Audience groups:** Casual, Hardcore, Family, and Online groups receive different satisfaction and attendance shares based on show type, card composition, match quality, hype/risk, sponsor boost, and rivalry heat. Their spending multipliers also adjust event income.
- **Fans:** the event builds a base fan amount from hype, risk, sponsor effects, segment bonuses, unique participants, rivalries, faction stories, and audience satisfaction. Fans grow only when the overall match rating is above the event-type threshold; otherwise, the calculated base change is applied as a loss. Thresholds are 7.5 for Regular Weekly, House Show, and Digital Only; 8.0 for PPV and One Time; and 8.5 for Mega Live. If there is no rated match, the fan-growth condition is not met.
- **Prestige:** event quality contributes via hype/risk, segment bonuses, wrestler popularity, match ratings, rivalry momentum, and competitor pressure. The detailed formula is in [prestige.md](prestige.md).
- **Roster:** match history, wins/losses, popularity changes from show interviews, title holders, stamina, happiness, and alignment can update. See [ROSTER_AND_STORYLINES.md](ROSTER_AND_STORYLINES.md), [HAPPINESS.md](HAPPINESS.md), and [HEEL_FACE_SYSTEM.md](HEEL_FACE_SYSTEM.md).
- **Other results:** sponsors react to event brand fit; rival promotions create counter-programming pressure; the event result records a postmortem and may offer a match-variety recommendation.

Segment setup contributes additional income, fans, and raw prestige before the larger event calculations. The current base bonuses are:

| Segment | Income | Fans | Raw prestige bonus |
|---|---:|---:|---:|
| Match | $180 | 7 | 1 |
| Main Event | $380 | 18 | 4 |
| Title Match | $320 | 15 | 3 |
| Interview | $95 | 4 | 0 |
| Promo | $120 | 5 | 1 |

Unlocked promo formats can add income/fans. A promo's raw prestige bonus is an input to the event prestige formula, not a direct prestige point award.

## Event preparation and recommendations

Event preparation can select a venue, featured wrestlers, a promo style, a presentation, and the ticket price. A featured-match campaign boosts the rating if the selected wrestlers appear together in a match; the campaign can penalize match ratings if the featured pairing does not appear. Promo styles add a small rating modifier. Venue and presentation are recorded in the outcome; venue catalog `rentFee` is not currently charged by the event resolver.

The postmortem can recommend variety when a card has at least three matches, one stipulation accounts for at least 60% of the card, and that format also appeared in at least two of the last three successful events. See [src/utils/eventPostmortemRecommendations.js](../src/utils/eventPostmortemRecommendations.js).

## Important implementation boundaries

- `EVENT_TYPE_CONFIG` in [src/store/useGameStore.js](../src/store/useGameStore.js) defines the scheduled event type defaults and maximum card sizes; `GAME_CONFIG.eventCost` defines run-time production costs.
- `market.eventTemplates` is importable catalog data, but the current scheduling and event-resolution path uses event types rather than consuming those template entries. Do not claim that a modded template changes event simulation unless code is added to connect it.
- An annual-recurring flag is stored on custom events, but the daily resolver does not itself create a new occurrence after a custom event runs. Check current code before promising automatic repeats.
- Event results include randomness. A favorite wrestler, high prestige, high hype, or strong skill does not guarantee a particular rating or business outcome.

## Source and tests

- Runtime resolution, sanitization, and event-type rules: [src/store/useGameStore.js](../src/store/useGameStore.js).
- Planning catalogs and payload normalization: [src/data/matchPlanning.js](../src/data/matchPlanning.js).
- Card setup and execution: [src/components/dashboard/modules/EventSetupModal.jsx](../src/components/dashboard/modules/EventSetupModal.jsx).
- Event schedule and player flow: [src/pages/DashboardPage.jsx](../src/pages/DashboardPage.jsx) and [src/components/dashboard/EventRequirementsOverlay.jsx](../src/components/dashboard/EventRequirementsOverlay.jsx).
- Integration examples: [src/store/gameStoreActions.test.js](../src/store/gameStoreActions.test.js).
- Variety recommendations: [src/utils/eventPostmortemRecommendations.test.js](../src/utils/eventPostmortemRecommendations.test.js).
- Event configuration defaults: [src/config/gameConfig.js](../src/config/gameConfig.js).