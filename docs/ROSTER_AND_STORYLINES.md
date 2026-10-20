# Roster and Storylines

Employees are the promotion's bookable people and its largest recurring commitment. Wrestler performance, championships, teams, factions, and rivalries are related systems, but their scores and effects are not interchangeable.

## People and hiring

The employee market contains wrestlers, managers, referees, announcers, and staff. Candidates become roster employees after a hiring offer is accepted. A wrestler's derived `skill` averages strength, technique, aerial ability, leg stamina, body stamina, head stamina, and popularity. Other roles use role-specific abilities plus popularity. Skill tiers are Rookie below 62, Solid at 62–81, and Elite at 82 or above.

Contracts have monthly salary, per-match salary, signing bonus, and term. New offers default to 12 months; valid contract terms range from 1 to 60 months. Hiring charges one negotiated monthly salary up front. Later monthly salary is charged on 30-day contract anniversaries; appearance fees for managers and support roles are charged when they participate in an event segment. These are different cash flows. See [FINANCE_MONEY_SYSTEM.md](FINANCE_MONEY_SYSTEM.md) for payroll and severance.

General staff can be assigned to Production, Medical, Talent Relations, or Logistics in Manage Employees. Their existing technical skill, teamwork, or reliability abilities drive capped discounts, injury recovery reductions, or daily happiness support. Department effects are described in [STAFF_UTILIZATION_IDEAS.md](STAFF_UTILIZATION_IDEAS.md).

Wrestler-specific state includes popularity (0–100), stamina (0–100), happiness (0–100), `heelFaceMeter` alignment, and match history. Skill is a quality input, popularity is an audience-draw input, and ranking points are calculated from popularity plus match outcomes. Do not treat any one of these as a substitute for the others.

Wrestler happiness and staff happiness are tracked. Match results, titles, inactivity, demands, bonuses, and departures can affect happiness; the complete rules are in [HAPPINESS.md](HAPPINESS.md). Alignment changes based on opponents and match rating, then drifts toward neutral on event runs; see [HEEL_FACE_SYSTEM.md](HEEL_FACE_SYSTEM.md).

## Championships

Titles have a division (`singles` or `doubles`), an active/inactive flag, and one or more holders. A `titleMatch` segment identifies a title and its result. A singles win changes the single holder; a doubles win can assign the winning team as holders. Winning a title grants the normal title-win happiness change. Active title holders can also affect merchandise and receive the configured appearance bonus.

Titles are separate from wrestler rankings. A title's own prestige value is catalog data, not the company's `stats.prestige`. The live title state and title-match resolver are in [src/store/useGameStore.js](../src/store/useGameStore.js); title definitions are in [src/data/titles.json](../src/data/titles.json).

## Teams and rankings

Teams group wrestlers for tag bookings and team-ranking views. They can be named by the player or formed automatically after a doubles-title change or when wrestlers have partnered in at least three tag matches within a 90-day window. Team ranking is computed separately for male and female divisions; a mixed team appears in both views. See [RANKING_POINTS.md](RANKING_POINTS.md) and [src/utils/wrestlerRank.js](../src/utils/wrestlerRank.js).

Team membership is not faction membership. Creating a wrestling team does not automatically make a faction, and faction allies do not have to be a tag team.

## Factions, faction rivalries, and backstage chemistry

A faction may contain 2–10 wrestlers and/or managers. Each eligible employee can belong to only one faction at a time. Faction rivalries have heat from 0 to 100 and are created/changed by promo story beats:

| Story beat | Heat added | Immediate event fan impact | Additional effect |
|---|---:|---:|---|
| `factionPromo` | 5 | 8 | Builds a feud between two different factions. |
| `interference` | 12 | 18 | Stronger conflict; can reduce chemistry between opposing participants. |
| `betrayal` | 15 | 15 | Moves a valid betrayer from the source faction to the target faction. |

Faction heat decays by one on an event run before new story-beat heat is applied. Faction heat contributes to the event's combined rivalry momentum; it can therefore influence crowd response and prestige as well as the direct story fan impact.

Backstage chemistry is stored per employee pair and clamped from -100 to 100. Booking allies together, tag partners, opposing wrestlers, staff interactions, interference, and betrayal can shift it. For a match segment, average chemistry contributes up to +0.5 or down to -0.5 match-rating points. Chemistry from the current event is updated for future use; it should not be interpreted as a permanent character stat.

These rules are centralized in [src/utils/backstageDynamics.js](../src/utils/backstageDynamics.js) and integrated by [src/store/useGameStore.js](../src/store/useGameStore.js). See [src/utils/backstageDynamics.test.js](../src/utils/backstageDynamics.test.js) and the event integration scenarios in [src/store/gameStoreActions.test.js](../src/store/gameStoreActions.test.js).

## Wrestler rivalries and match history

Wrestler rivalries are pair-specific and separate from faction rivalries. A match/main-event/title-match involving two wrestlers adds heat; segment type, match rating, and a recorded winner affect the amount. Existing wrestler heat decays by one on each event run, is capped at 100, and low-heat entries are eventually removed. Heat from the card contributes to event fan and prestige momentum.

Every match segment also records participant details, match type, winner, rating, event, and day in match history. The ranking system reconstructs unique matches from that history and awards points to winners/penalizes losers; see [RANKING_POINTS.md](RANKING_POINTS.md). Promos and interviews can be recorded in history but are not ranked as matches.

## Source of truth

- Candidate creation and role-skill derivation: [src/data/employeeMarket.js](../src/data/employeeMarket.js).
- Hiring, firing, title outcomes, teams, factions, and event integration: [src/store/useGameStore.js](../src/store/useGameStore.js).
- Alignment: [src/utils/heelFaceMeter.js](../src/utils/heelFaceMeter.js).
- Team/wrestler rankings: [src/utils/wrestlerRank.js](../src/utils/wrestlerRank.js).
- Faction chemistry and stories: [src/utils/backstageDynamics.js](../src/utils/backstageDynamics.js).