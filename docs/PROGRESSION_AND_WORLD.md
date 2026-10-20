# Progression and Competitor World

Progression gives a new promotion short-term guidance and longer-term rewards. The competitor world adds uncertainty and outside pressure; it is not a deterministic opponent ladder.

## Guided onboarding challenge

Every new game starts a 21-day rescue challenge. It has three objectives:

1. **Build a roster:** at least 12 wrestlers, one staff member, one referee, and one announcer.
2. **Run weekly shows:** complete three successful Regular Weekly events. Custom events do not count toward this counter.
3. **Stabilize the promotion:** gain at least 350 fans over the starting baseline and reach at least $0 cumulative operating cash flow for the challenge period.

All objectives must be complete by the deadline. Completion awards $80,000 and 4 prestige. Failure applies -250 fans and -3 prestige. The operating cash-flow objective sums timeline income minus expenses; one-time hiring and booking transactions are outside that operating measure. The guided dashboard stages are implemented in [src/utils/onboardingTutorial.js](../src/utils/onboardingTutorial.js).

After the challenge completes or fails, its tutorial guide can be permanently dismissed for that save. The challenge summary remains available from the dashboard.

## Popularity-gated wrestlers

The top half of wrestlers in the combined built-in and imported wrestler pool are popularity-gated. Popularity ranks descending, with stable IDs breaking ties. Four popularity cohorts require company prestige of 100, 300, 800, and 1500, from the least popular gated cohort to the most popular. Prestige access is a current requirement; completing a Career Arc permanently unlocks the least popular wrestler who is still gated at the company's current prestige. This provides a goal-based path as an alternative to reaching the prestige requirement.

Locked candidates remain visible in the hiring market with their requirement, but cannot be negotiated with or hired. The store validates both actions, including requests made outside the hiring UI. Goal unlock IDs and tutorial dismissal are persisted with normal game saves. Rules are in [src/utils/wrestlerUnlocks.js](../src/utils/wrestlerUnlocks.js), and candidate access is enforced in [src/store/useGameStore.js](../src/store/useGameStore.js).

## Career arcs

Career arcs last 56 in-game days. Each arc selects one of three templates: audience growth, prestige growth, or profit stability. Goals measure net changes in fans, prestige, and cash from the arc's starting snapshot. All three goals must be met; cash gain is the change in the cash balance and can include direct transactions, unlike the onboarding operating-cash-flow objective.

Completing an arc awards its cash, prestige, and sponsor-trust rewards, unlocks the next unique item in each available reward category, grants the next eligible popularity-gated wrestler when one remains, records the result, and starts a new arc. If the end day passes without completing all goals, the arc is recorded as failed and a new arc begins; the arc itself does not apply a separate failure penalty.

Unlock categories are:

- **Venues:** selectable presentation/context for an event; venue `rentFee` metadata is not currently charged by event resolution.
- **Promo styles:** small match-rating modifiers for the featured-wrestler campaign.
- **Promo segments:** formats with configured extra income and/or fan bonuses.
- **Presentations:** presentation/theme selection recorded with the event result.

The live goal templates and completion checks are in [src/store/useGameStore.js](../src/store/useGameStore.js). Unlock data is in [src/data/careerArcUnlocks.js](../src/data/careerArcUnlocks.js), with tests in [src/data/careerArcUnlocks.test.js](../src/data/careerArcUnlocks.test.js) and [src/store/careerArcUnlockPersistence.test.js](../src/store/careerArcUnlockPersistence.test.js).

## Rival promotions

Three persistent rival companies have long-term strategies: Talent Acquisition, Counter-Programming, and Audience Expansion. Each company changes strategy on its own 28-day cycle after a staggered initial due day. This strategy-review cadence is independent of rival cards, which are simulated weekly. A strategy alters its chance of signing a free-agent wrestler, its event counter-programming strength, or its audience pressure. Strategy changes and major actions are reported through the Competition Desk.

The competitor world has a shared pool of 100 Faker-generated wrestlers from India, Bangladesh, Pakistan, Nepal, Sri Lanka, and Afghanistan. Each rival receives a separate, non-overlapping roster of 20–30 wrestlers; remaining pool members are unsigned. Rivals run weekly cards beginning on game day 7. A card books up to 10 matches, updates wrestler win/loss records, and resolves world and tag-team title defenses or changes using wrestler skill, popularity, and random match variance. The pool, roster assignments, champions, event results, and schedule are saved with the game. The Competition Desk shows localized rival names, current champions and defenses, the latest event card, and a collapsible roster with wrestler countries and records.

The daily world simulation may sign a market wrestler before the player, copy one of the player's wrestler archetypes, counter-program the player's event, expand audience reach, or poach a wrestler with happiness at or below 16. These actions can affect fans/prestige and remove a candidate or vulnerable wrestler from the player's options/roster. The chance-based actions are random; do not state that a particular rival action is guaranteed on a specific day.

Event-night competitor pressure is a separate calculation from the daily world actions and rival show simulation. It selects a rival, then combines event rating, rivalry heat, event scale, rival aggression/strategy, and random drift into a bounded fan/prestige swing. Results and news appear in the event postmortem and Competition Desk feed.

Persistent strategy rules are in [src/utils/competitorWorld.js](../src/utils/competitorWorld.js); event and daily pressure calculations are in [src/store/useGameStore.js](../src/store/useGameStore.js). Tests are in [src/utils/competitorWorld.test.js](../src/utils/competitorWorld.test.js) and [src/store/gameStoreActions.test.js](../src/store/gameStoreActions.test.js).

## Board governance and interviews

Monthly Board Meetings, weighted votes, mandates, relation, and dismissal risks are described in [BOARD_MEETING_PLAN.md](BOARD_MEETING_PLAN.md). Board state advances through the same calendar but is resolved through its dedicated meeting flow.

AI Media Interviews are optional OpenRouter-backed activities. Their answer scoring and game consequences are deterministic code, not instructions the remote model can invent. See [AI_INTERVIEWS.md](AI_INTERVIEWS.md) for eligibility, retries, consequence bounds, and story-focus effects.