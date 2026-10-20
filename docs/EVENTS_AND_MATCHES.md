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

Match slots require at least two wrestlers; tag slots require a participant on both teams. Matches require a referee. Main events and interviews require an announcer. Wrestlers with stamina below 10 or an active injury cannot be placed in a match. Injured wrestlers remain on the roster until their normal recovery day and may still appear in non-match segments. Managers can appear in interviews/promos, not as match wrestlers. The UI's selected match stipulation is recorded as card data; do not assume each stipulation has its own independent resolution algorithm.

Booked support employees contribute only when selected or included in the segment. A manager adds up to 2 fans when appearing with a wrestler they manage in an interview or promo. A referee adds up to 0.25 match rating, and an announcer adds up to 0.2 match rating plus up to 2 fans on segments they announce. Combined support fan impact is capped at 4 per segment. These presentation effects never change the match winner. Results list each applied contribution.

## Match execution

For each match segment the player can simulate or plan it:

- **Simulate:** generate a randomized internal event profile and score it with the same event-based rating engine as authored matches. A higher skill raises expected execution quality; it does not guarantee victory.
- **Plan:** choose the winner, finish, and pace, then create an ordered timeline of up to 60 moments. Set duration from 1 to 60 minutes using a slider, numeric input, or presets. Required actors, targets, and props receive inline validation; duplication, removal, and empty timelines are supported. Drafts survive execution-segment navigation and returning to setup within the open setup screen.
- Props are a multi-select option. Supported props include chairs, tables, ladders, kendo sticks, steel steps, and the announce table. A prop must be selected for the match before a `usesProp` moment can use it.
- Ratings are clamped to 1–10. Capability, actual event execution, structure, variety/pacing, finish coherence, and risk management determine quality, with a modest context adjustment. Selected referee and announcer presentation effects are applied afterward. Adding repeated moments, unused props, or duration does not grant free quality. Duration, action intensity, actor/target involvement, actual prop use, and risky/chaotic pacing determine stamina drain, capped at 70 per wrestler per match; daily stamina recovery remains 10.
- Finishing below 20 stamina causes an injury lasting a random 7–90 game days. Assigned Medical staff reduce the resulting duration by up to 15%, but cannot prevent an injury or reduce recovery below seven days. Later matches involving the injured wrestler are cancelled without match rewards or per-match fees. Results and roster details show injury and recovery information. See [STAMINA_AND_INJURIES.md](STAMINA_AND_INJURIES.md) for the calculation, availability rules, and persistence behavior.
- Tag outcomes record the winning team. Singles outcomes record one winning wrestler. A title match applies the result to the configured title after validation.

The execution flow is in [EventSetupModal.jsx](../src/components/dashboard/modules/EventSetupModal.jsx), with the timeline in [MatchPlanner.jsx](../src/components/dashboard/modules/MatchPlanner.jsx). The store validates against active wrestlers and the shared plan schema before applying results; failed validation leaves state unchanged. New outcomes include a sanitized rating breakdown, selected versus used props, and stable diagnostic codes. Legacy results without breakdowns remain supported. See [MATCH_PLANNING.md](MATCH_PLANNING.md) for usage, weights, and compatibility details.

## What a successful event changes

The result aggregates multiple systems; no single stat alone determines success:

- **Attendance and gate:** event type supplies a configured audience range and ticket default. Current fans and prestige, configured weights, and a random crowd factor set attendance. Ticket revenue is adjusted by sponsors, board attendance, segment income bonuses, and audience spending fit.
- **Audience groups:** Casual, Hardcore, Family, and Online groups receive different satisfaction and attendance shares based on show type, card composition, match quality, hype/risk, sponsor boost, and rivalry heat. Their spending multipliers also adjust event income.
- **Fans:** the event builds a base fan amount from hype, risk, sponsor effects, segment bonuses, unique participants, rivalries, faction stories, and audience satisfaction. Fans grow only when the overall match rating is above the event-type threshold; otherwise, the calculated base change is applied as a loss. Thresholds are 7.5 for Regular Weekly, House Show, and Digital Only; 8.0 for PPV and One Time; and 8.5 for Mega Live. If there is no rated match, the fan-growth condition is not met.
- **Prestige:** event quality contributes via hype/risk, segment bonuses, wrestler popularity, match ratings, rivalry momentum, and competitor pressure. The detailed formula is in [prestige.md](prestige.md).
- **Roster:** match history, wins/losses, popularity changes from show interviews, title holders, stamina, happiness, and alignment can update. Talent Relations staff can support the lowest-happiness wrestlers daily. See [ROSTER_AND_STORYLINES.md](ROSTER_AND_STORYLINES.md), [HAPPINESS.md](HAPPINESS.md), and [HEEL_FACE_SYSTEM.md](HEEL_FACE_SYSTEM.md).
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