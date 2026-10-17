# Game Loop and State

This guide describes how a new promotion starts, how game time advances, and where the resulting state is stored.

## Starting a promotion

`startGame` requires a non-empty player name and company name. A new game uses the configured starting values: $500,000 cash, 1,000 fans, 10 prestige, and company morale 60 by default. The start date comes from `VITE_GAME_START_DATE` when configured, otherwise the local current date. Day 1 is that date.

A new game begins with no hired employees, the catalog titles, generated hiring and sponsor offers, event templates, the default unlock bundle, three competitor companies, a first career arc, and the 21-day onboarding challenge. See [src/store/useGameStore.js](../src/store/useGameStore.js) and [src/config/gameConfig.js](../src/config/gameConfig.js) for the actual defaults.

## Calendar model

- `calendar.day` is a one-based integer. The real game date for a day is the start date plus `day - 1` calendar days.
- `calendar.week` is a simple seven-day counter: `floor((day - 1) / 7) + 1`. It is not a calendar-month number.
- A regular weekly event is scheduled whenever the real game date is Friday. Therefore, it may not occur exactly every seven integer days from Day 1 if Day 1 is not Friday.
- The finance system treats a game month as 30 days for contract salary anniversaries. Board meetings use actual calendar months and are scheduled on the first available day on or after the first of each month.
- Custom events use a `scheduledDay` and can take precedence over the Friday show when scheduled for that date.

Date conversion and validation are implemented in [src/utils/gameCalendar.js](../src/utils/gameCalendar.js). The date tests are in [src/utils/gameCalendar.test.js](../src/utils/gameCalendar.test.js).

## Advancing one day

The dashboard routes a day through the relevant interaction before advancing: a scheduled board meeting, an optional interview, event preparation, or event-day setup. Ordinary days advance directly. The store action is `proceedTimeline` in [src/store/useGameStore.js](../src/store/useGameStore.js).

At a high level, one timeline advance:

1. Determines the next calendar day and advances competitor strategy schedules.
2. Checks whether a custom event is due on the current day or whether the current date is a Friday.
3. Runs event resolution only when both a production event exists and event setup/results were submitted. Merely having a scheduled or projected event does not create an event result.
4. Applies daily simulation changes: employee stamina recovery, applicable match/event effects, sponsor and competitor changes, income/expenses, employee contract/morale updates, and progression/mandate progress.
5. Writes the next day to the calendar and appends a timeline summary.

If event staffing requirements are not met, the dashboard blocks normal event setup and offers the player a choice to return or skip. The UI requirement is at least 12 wrestlers, one staff member, one referee, and one announcer. Skipping applies the event-skip prestige penalty and advances the day without that event's gate or event-performance effects. Daily income and expenses still run. Requirements are checked by [src/components/dashboard/EventRequirementsOverlay.jsx](../src/components/dashboard/EventRequirementsOverlay.jsx); event resolution details are in [EVENTS_AND_MATCHES.md](EVENTS_AND_MATCHES.md).

## Persistent state and history

Zustand persistence uses the local-storage key `wrestling-tycoon-save-v1`. The persisted model includes the active profile, calendar, finance, roster, market, event world, progression, board state, stats, UI, and AI state. On restore, the store normalizes older or incomplete saves: it repairs date and employee shapes, merges catalog titles, restores default unlocks, and rebuilds derived event projections. Do not assume a saved `bookedEvent` or cached UI value is the authoritative source for event execution; the current day, scheduled events, and event result are separate state.

Recent histories are bounded to keep saves manageable: the daily timeline retains 45 entries, the finance ledger 120, completed event log 100, competitor headlines 80, board minutes 24, and career-arc history 16. These limits are implementation details and may change.

## State groups at a glance

| Group | Examples | What it represents |
|---|---|---|
| `calendar` | `day`, `week`, `startDateIso`, `isEventDay` | Current simulated time. |
| `finances` | `cash`, `subscriptionFee`, `ticketFees`, `ledger` | Operating money and recorded transactions. |
| `stats` | `fans`, `prestige`, `morale` | Promotion-level health and audience metrics. |
| `roster` | `employees`, `titles`, `sponsors`, `teams`, `factions`, `backstageChemistry` | Hired talent, relationships, and active business deals. |
| `market` | `employeeCandidates`, `sponsorOffers`, `wrestlerArchetypes`, `modVenues` | Available hires and importable/earned content. |
| `events` | `customEvents`, `bookedEvent`, `lastOutcome`, `eventLog`, `rivalries` | Scheduled shows and story/world results. |
| `progression` | `currentArc`, `history`, `unlocks` | Medium-term objectives and earned content. |

The finance ledger and operating-day calculations are explained in [FINANCE_MONEY_SYSTEM.md](FINANCE_MONEY_SYSTEM.md). The calendar and daily-close integration are exercised by [src/store/financeSimulation.test.js](../src/store/financeSimulation.test.js), while store lifecycle and persistence behavior are covered by [src/store/gameStoreActions.test.js](../src/store/gameStoreActions.test.js) and [src/store/careerArcUnlockPersistence.test.js](../src/store/careerArcUnlockPersistence.test.js).