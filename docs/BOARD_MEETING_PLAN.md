# Board Meeting System Specification

> **Status:** Implemented. This document describes the current monthly Board Meeting flow and its persisted governance state.

## Purpose and cadence

Board Meetings are non-wrestling appointments scheduled monthly on the first available day on or after the first calendar day of the month. A Friday weekly show, custom event, annual recurring event, or earlier shifted Board Meeting reserves that date; a meeting moves forward one day at a time until it finds an empty date.

The meeting is a decision point, not an event-production flow. On the meeting date, the player reviews a financial report and resolves exactly three unique discussion topics. The report is always visible; when finances are negative, Financial Review is guaranteed to occupy one of the three agenda slots.

## State to persist

- **Board Relation:** 0-100, initially 60.
- **Board President and Vice President:** current elected officers, initially the Board Chair and Vice Chair.
- **Board Election History:** recent January election results.
- **Consecutive Negative Finance Months:** number of completed meeting periods with negative operating net.
- **Last Meeting Day:** prevents duplicate monthly evaluations and supports save/load.
- **Active Meeting:** date, financial report, three agenda items, current item, choices, proposals, and votes.
- **Pending Mandates:** board commitments with an owner, target, start day, due day, and resolution status.
- **Meeting History:** completed reports, agenda choices, vote results, relation changes, mandates, and dismissal results.
- **Rejection Counts and Cost Relief:** repeated-proposal rejection tracking and temporary operating-cost relief.
- **Game-over reason:** preserve why the manager was dismissed for the game-over screen.

Legacy saves receive safe defaults: Relation 60, zero consecutive negative months, no active meeting, and empty mandate/history collections.

## Finance report and manager pressure

At each Board Meeting, sum the completed daily timeline entries after the previous meeting through the current meeting day:

> Daily operating income minus daily operating expenses.

The report includes recurring payroll, appearance fees, event production, operating costs, sponsor income, event revenue, subscriptions, merchandise, and other daily income/expenses. It excludes separate one-time hiring, booking, and signing transactions.

- Positive or break-even operating net resets the negative-month counter.
- Negative net increments the counter and forces Financial Review into the agenda.
- On the first and second consecutive negative periods, the manager must select a recovery response and receives board pressure.
- On the third consecutive negative period, the manager is fired and the game ends. This is deterministic and takes precedence over the random Relation dismissal check.

## Agenda generation

Build an eligibility-filtered pool, then draw three distinct topics without replacement. Weight topics according to current game conditions; never choose an unavailable topic.

1. **Financial Review:** always shown as the report; becomes an actionable agenda item when operating net is negative.
2. **Board Election:** added to January meetings; the player casts a weighted ballot for President and Vice President from board members other than the General Manager.
3. **Sponsor Review:** show current sponsors and propose an eligible sponsor offer; accept or reject it.
4. **Event Review:** upcoming event or recent event performance is relevant.
5. **Champion Change:** eligible when an active title and suitable wrestlers exist.
6. **Wrestler Push:** eligible when there is an active roster and a plausible candidate.
7. **Event Rating Target:** eligible when a future show exists.
8. **Investment / Budget:** eligible when spending choices could be made.
9. **Competitor Response:** eligible when a competitor development or pressure signal exists.
10. **Mandate Review:** eligible while commitments remain active; reaffirm them, extend deadlines, or cancel them.
11. **Promotion Strategy:** a standing topic to confirm the promotion's growth direction.

The meeting contains exactly three unique topics. Financial Review is mandatory when the report is negative; the January election is also mandatory and is presented last. Agenda choices have role-associated proposers in the agenda pool, but the meeting store currently assigns the visible presenter randomly from the board members (excluding the General Manager); role-weighted presenter selection is not implemented.

## Decisions and effects

Every resolved decision records its Relation change, including accepting, rejecting, or declining a proposal. The meeting screen shows agenda context, descriptive choices, the expected Relation change, any cash cost, and whether a vote is required.

- **Financial Review:** present a recovery plan, enact cost controls, or reject board pressure. The choice affects Relation and can create a mandate.
- **Sponsor Review:** show active contracts and an eligible proposed sponsor. Acceptance uses existing sponsor-signing rules; rejection costs Relation with the proposer.
- **Event Review:** approve event promotion spending or protect cash with a leaner event. Use actual event results and upcoming event context.
- **Champion Change:** approve or reject the proposed change and apply approved changes through the existing title-holder model.
- **Wrestler Push:** accept or decline a push request. Acceptance creates a measurable booking/appearance mandate with a due date; fulfilling it earns Relation, while missing it costs more than declining up front.
- **Event Rating Target:** accept or decline a rating target for a specific upcoming event. Resolve it from the recorded event rating at the deadline.
- **Mandate Review:** reaffirm active commitments, extend their deadlines, or cancel them with a Relation cost.
- **Long-Term Strategy:** recommit to growth or maintain the current direction; each option changes Relation.
- **Investment / Budget:** choose between a cost-saving plan and a growth plan with explicit cash-flow trade-offs.
- **Competitor Response:** select a response that trades cash, roster resources, or brand positioning for a possible competitive benefit.

Where a board vote is required, count votes by shareholding percentage. The current seven shares total 100%; a proposal passes with more than 50% support. Relation may affect individual members' willingness to support the manager, but the UI must show the votes and weights.

## Relation and dismissal rules

Use one global Board Relation score for the first release. Clamp it to 0-100. Choices and mandate outcomes provide small, visible gains/losses; repeated rejections of the same board member's proposals incur increasing Relation penalties, capped at an additional 6 points.

After all three agenda decisions, make at most one dismissal roll:

- Relation 25-100: 0% random dismissal chance.
- Relation 10-24: 30% chance.
- Relation 0-9: 80% chance.

Use mutually exclusive bands, so Relation below 10 receives 80%, not both rolls. A third consecutive negative finance period causes deterministic dismissal regardless of this roll.

## Meeting presentation

Open a dedicated meeting screen on the scheduled day; do not open event setup or run wrestling matches. Present:

1. A monthly financial snapshot and negative-month streak.
2. The current agenda item, proposing member, and relevant game context.
3. Agenda context and choices, the expected Relation change, any cash cost, and any vote requirement.
4. A running Relation indicator and mandate deadlines.
5. A closing summary with the minutes and dismissal result, if applicable.

The Board tab shows the seven board-member portraits, Relation, finance streak, recent meeting minutes, active mandates, and the next scheduled Board Meeting. A fired manager receives a game-over screen with the dismissal reason and reset option.

## Implementation sequence

1. [x] Save this specification and add pure domain tests for agenda generation, finance streaks, weighted votes, Relation changes, and dismissal thresholds.
2. [x] Implement the pure board-meeting rules and pass those tests.
3. [x] Add persisted state, old-save migration, finance-period evaluation, agenda creation, decision resolution, mandates, and game-over state.
4. [x] Integrate sponsor/title/roster/event decisions with existing store actions and add the meeting UI.
5. [x] Add agenda selection, meeting/minutes, mandate, and dismissal integration tests.
6. [x] Run the complete test suite, lint the changed files, and build the production app.

## Suggested follow-up agenda ideas

- Sponsor renewal or brand-fit concerns.
- Contract retention, salary pressure, or a hiring budget.
- Venue, marketing, streaming, or production investments.
- Competitor response and talent poaching.
- Shareholder concerns tied to the member's represented company.
- Review of promises made at the previous meeting.
