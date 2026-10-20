# Getting More Value from Staff

This document summarizes current non-wrestler employee uses, including the department assignments and event effects now available.

## Current uses

The employee market has five roles: wrestlers, managers, referees, announcers, and general staff. Each role has its own skill profile, and all hires have contract costs.

| Role | Current use |
|---|---|
| **Manager** | Can be assigned to a wrestler and booked in interviews or promos. When an assigned wrestler and their manager appear together in one of those segments, promo skill and charisma add up to 2 fans. Managers can also join factions and faction story beats. Appearing managers receive the existing support-employee appearance fee. |
| **Referee** | At least one is required on the roster to run an event. Matches require a selected referee. Officiating skill adds up to 0.25 match rating; the referee does not affect the winner. |
| **Announcer** | At least one is required on the roster to run an event. Main events and interviews require an announcer; title matches can optionally use one. Broadcast skill adds up to 0.2 match rating on matches and up to 2 fans on a segment where the announcer appears. |
| **General staff** | At least one is required on the roster to run an event. Staff can be assigned to Production, Medical, Talent Relations, or Logistics. Each department uses the relevant staff ability to provide a capped operating benefit. |

### Shared employee systems

- All roles can be hired, negotiated with, sorted, managed, and released under the employee contract system.
- Employees have monthly salary and per-appearance salary terms. Managers, referees, announcers, and general staff who participate in event segments incur their support-employee fee; repeated use can add a configured heavy-usage bonus.
- Happiness is tracked for wrestlers and general staff. Low happiness can lead to demands and, if unresolved, departure. It is not currently tracked for managers, referees, or announcers.
- Role skills are derived from each role's attributes and popularity and shown as an employee skill score. The manager, referee, and announcer ability profiles are role-specific; general staff skill is derived from the four staff abilities and popularity.

Role skills are used in the effects below. A skill being stored or displayed does not by itself imply any additional effect beyond those described here.

## Staff departments

Department assignments are available on each general staff employee card. A staff member can have one department at a time; unassigned or legacy staff have no department effect.

| Department | Implemented, bounded effect |
|---|---|
| **Production** | Reduces event production cost by 5% per assigned staff member at 100 technical skill, capped at 10%. |
| **Medical** | Reduces injury duration by 10% per assigned staff member at 100 technical skill, capped at 15%. Injury risk and minimum recovery time remain. |
| **Talent Relations** | Each staff member covers `ceil(teamwork / 50)` wrestlers, up to two per employee. The lowest-happiness wrestlers (maximum four covered) receive +1 happiness per timeline day, up to 100. |
| **Logistics** | Reduces daily operating cost by 5% per assigned staff member at 100 reliability, capped at 10%. Existing board cost relief still applies afterward. |

Department benefits stack only to their stated cap. The roster card displays the ability-derived effect for the selected department; department benefits are not appearance bonuses and do not require the staff member to be booked.

## Booking-linked support effects

- **Managers:** a manager must be assigned to a wrestler and appear in the same interview or promo as that wrestler. The fan impact is `min(2, round(average(charisma, promo_skill) / 50))`. Merely assigning a manager has no immediate effect; the manager must be booked.
- **Referees:** for an actual match segment, the selected referee's average officiating ability adds `clamp((skill - 50) / 200, 0, 0.25)` match rating.
- **Announcers:** on a match, the selected announcer's average broadcast ability adds `clamp((skill - 50) / 250, 0, 0.2)` match rating. On any segment with an announcer, fan impact is `min(2, round(skill / 50))`.

Support effects improve presentation and fan impact only; they do not alter match winners. Combined support fan impact is capped at four per segment, and the event result lists contributing support employees and their actual rounded effects. Match rating remains capped from 1 to 10.

## Rollout and guardrails

1. General staff assignments default to unassigned when restoring older saves.
2. Department formulas use existing abilities and have fixed caps; several employees cannot stack beyond those caps.
3. Managers, referees, and announcers must participate in the relevant segment to contribute. Support employees who participate are charged their existing appearance fee.
4. Results retain each applied contribution, while managers and support staff never decide match outcomes.
5. Focused coverage lives in [src/utils/staffOperations.test.js](../src/utils/staffOperations.test.js), [src/utils/matchHealth.test.js](../src/utils/matchHealth.test.js), and [src/store/gameStoreActions.test.js](../src/store/gameStoreActions.test.js).

## Relevant implementation references

- Hiring and role-skill calculation: [src/data/employeeMarket.js](../src/data/employeeMarket.js)
- Employee management and manager assignment UI: [src/components/dashboard/modules/ManageEmployeesModule.jsx](../src/components/dashboard/modules/ManageEmployeesModule.jsx)
- Event staffing requirements: [src/components/dashboard/EventRequirementsOverlay.jsx](../src/components/dashboard/EventRequirementsOverlay.jsx)
- Event segment roles and requirements: [docs/EVENTS_AND_MATCHES.md](./EVENTS_AND_MATCHES.md)
- Employee payroll and appearance fees: [docs/FINANCE_MONEY_SYSTEM.md](./FINANCE_MONEY_SYSTEM.md)
- Happiness and departures: [docs/HAPPINESS.md](./HAPPINESS.md)
