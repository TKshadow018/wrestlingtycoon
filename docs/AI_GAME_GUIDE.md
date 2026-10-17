# AI Game Guide

This is the short orientation document for an AI assistant, agent, or contributor who needs to understand Wrestling Tycoon before answering a gameplay question or changing code. Use the linked system guides for details.

## What the game is

Wrestling Tycoon is a single-player promotion-management simulation. The player runs a wrestling company: recruit and retain employees, schedule and produce shows, choose match results, manage cash and sponsors, build fan interest and prestige, and respond to the board and rival promotions. There is no single scripted win condition; the main challenge is sustainable growth while keeping the promotion operational.

## Source-of-truth rules

When researching a rule, prefer these sources in this order:

1. Runtime state transitions and formulas in [src/store/useGameStore.js](../src/store/useGameStore.js).
2. Pure domain rules in [src/utils](../src/utils) and catalogs/defaults in [src/data](../src/data).
3. Tests beside those modules; tests are executable examples of expected behavior.
4. These Markdown guides and the [README](../README.md), which summarize behavior and can lag behind code.

Configuration defaults and environment-variable overrides live in [src/config/gameConfig.js](../src/config/gameConfig.js). Assume a value is a default, not a universal constant, unless it is hard-coded in the relevant rule. Some outcomes use randomness; describe ranges and conditions rather than promising a specific result.

The local interview model is separate from the gameplay simulator: it generates dialogue in the browser, while answer evaluation and its gameplay consequences are applied by JavaScript rules. See [AI_INTERVIEWS.md](AI_INTERVIEWS.md).

## Core vocabulary

| Term | Meaning |
|---|---|
| **Game day** | The integer day in `calendar.day`; day 1 is `calendar.startDateIso`. It advances one day at a time. |
| **Regular weekly show** | The system show scheduled on Fridays according to the configured real calendar date. It is not the same as a custom event. |
| **Event** | A scheduled show with a type, date, and maximum number of card slots. Scheduling a show is not the same as running it. |
| **Segment** | One card slot: a match, main event, title match, interview, or promo. |
| **Skill** | A worker-performance rating derived from role abilities and popularity. It is distinct from popularity and rank. |
| **Popularity** | A wrestler's individual audience draw, stored from 0 to 100. It affects match quality and some income calculations. |
| **Match rating** | A segment-quality result on a 1-to-10 scale. It is not a win probability or ranking score. |
| **Fans** | The promotion's audience count. It is not company prestige. |
| **Prestige** | The promotion's reputation score. It starts at 10, cannot go below 0, and has no upper cap. |
| **Happiness** | An individual employee's satisfaction. Wrestlers and staff are tracked; low happiness can cause demands or departure. |
| **Morale** | A separate company-wide stat in `stats.morale`; do not use it as a synonym for employee happiness. |
| **Alignment** | A wrestler's heel/face position, stored as `heelFaceMeter` from 0 (face) through 50 (neutral) to 100 (heel). |
| **Team** | A wrestling group primarily used for tag bookings and team rankings. |
| **Faction** | A story group of wrestlers and/or managers. Membership and faction rivalries affect promo story beats and backstage chemistry. |
| **Rivalry heat** | Pair-specific story momentum between wrestlers or factions. It is not the same as match rating or ranking points. |

For exact calculations, see [EVENTS_AND_MATCHES.md](EVENTS_AND_MATCHES.md), [ROSTER_AND_STORYLINES.md](ROSTER_AND_STORYLINES.md), and the existing [prestige.md](prestige.md), [RANKING_POINTS.md](RANKING_POINTS.md), [HAPPINESS.md](HAPPINESS.md), and [HEEL_FACE_SYSTEM.md](HEEL_FACE_SYSTEM.md).

## State map

The Zustand store is the live game model. Its top-level groups are:

- `gameStatus`, `profile`, `calendar`: game lifecycle, company identity, and date/day counters.
- `finances`, `stats`: cash, ledger, ticket/subscription settings, fans, prestige, and company morale.
- `roster`, `market`: hired employees, titles, sponsors, teams, factions, chemistry, hiring candidates, and mod data.
- `events`: custom and projected events, last result/event history, rivalries, competitor companies/news, and event preparation.
- `progression`, `onboardingChallenge`, `boardMeeting`: career arcs/unlocks, the 21-day starter challenge, and governance.
- `ai`, `ui`: local interview/model state and dashboard navigation state.

Read the current state rather than inferring it from display text. In particular, a `bookedEvent` is a projection of the next scheduled show; it does not prove that a show was executed or that it produced an outcome.

## Read next

1. [GAME_LOOP_AND_STATE.md](GAME_LOOP_AND_STATE.md) — dates, daily advancement, persistence, and onboarding into the loop.
2. [EVENTS_AND_MATCHES.md](EVENTS_AND_MATCHES.md) — event scheduling, card setup, match execution, and results.
3. [ROSTER_AND_STORYLINES.md](ROSTER_AND_STORYLINES.md) — contracts, titles, teams, factions, chemistry, and rivalries.
4. [PROGRESSION_AND_WORLD.md](PROGRESSION_AND_WORLD.md) — onboarding, career arcs, unlocks, and competitor simulation.
5. [SPONSORS_AND_MOD_PACKAGES.md](SPONSORS_AND_MOD_PACKAGES.md) — sponsor relationships and imported game data.

Existing focused guides cover [finance](FINANCE_MONEY_SYSTEM.md), [board governance](BOARD_MEETING_PLAN.md), [interviews](AI_INTERVIEWS.md), [happiness](HAPPINESS.md), [prestige](prestige.md), [ranking](RANKING_POINTS.md), and [alignment](HEEL_FACE_SYSTEM.md).

## Answering gameplay questions

Before giving advice, establish the current game day and relevant live state; distinguish a scheduled event from a completed event; identify whether the question concerns company stats or an individual wrestler; and check relevant config/data values. Clearly mark random outcomes as uncertain. Do not treat UI narration, a model-generated interview line, or a modded catalog entry as proof that the underlying simulator applied a particular effect.

## Key tests

- [src/store/gameStoreActions.test.js](../src/store/gameStoreActions.test.js): store actions and integrated game flows.
- [src/store/financeSimulation.test.js](../src/store/financeSimulation.test.js): daily close, calendar advancement, and finance objectives.
- [src/store/boardMeetingIntegration.test.js](../src/store/boardMeetingIntegration.test.js): board meeting integration.
- [src/utils/gameCalendar.test.js](../src/utils/gameCalendar.test.js): game-date rules.
- [src/utils/backstageDynamics.test.js](../src/utils/backstageDynamics.test.js) and [src/utils/competitorWorld.test.js](../src/utils/competitorWorld.test.js): story and competitor rules.