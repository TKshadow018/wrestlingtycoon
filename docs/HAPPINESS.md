# Happiness System

This document explains how wrestler/staff happiness works in Wrestling Tycoon.

## Who Has Happiness

- Tracked roles: `wrestler`, `staff`
- Default happiness for tracked roles: `50`
- Happiness range is clamped to `0..100`

## Daily/Event Happiness Rules

### Match Outcome (wrestlers)

- Win vs 1 opponent: `+1`
- Win vs multiple opponents: `+1` per opponent
- Loss vs 1 opponent: `-2`
- Loss vs multiple opponents: `-1`

### Title Win (wrestlers)

- Any title holder change where a wrestler becomes holder: `+10` per title won

### Inactivity (wrestlers)

- If no match participation for 30 days: `-3`
- Inactivity penalty can apply once every 30 days

### Talent Relations staff support

- Each general staff member assigned to Talent Relations covers `ceil(teamwork / 50)` wrestlers, from zero to two.
- Coverage is capped at four wrestlers total. At each timeline update, the currently lowest-happiness wrestlers below `100` receive `+1` happiness each, up to the available coverage.
- This support is applied before demand and departure checks; it does not override those rules or guarantee retention.

## Morale Demands and Title Promises

When a wrestler or staff member with no active demand reaches happiness `22` or lower, each daily simulation update has a 35% chance to create a demand. A demand is due seven in-game days after it is created.

- **Salary raise:** either tracked role can request a raise. The request is the greater of `$1,000` or 15% of monthly salary, rounded to a whole dollar. Approving it requires sufficient cash, raises happiness by `12`, increases monthly salary by 10%, and increases per-match salary by 8%. Rejecting it reduces happiness by `10`.
- **Title shot:** wrestlers can request a title shot instead of a salary raise. Approval raises happiness by `9` and creates a 21-day promise. A title win before the promise expires grants the normal title-win happiness plus a `+6` promise bonus. Missing the deadline applies a `-12` happiness penalty. Rejecting the demand reduces happiness by `10`.
- **Overdue demands:** happiness falls by `1` per overdue day, then by `2` per day once the demand is at least six days overdue. If the demand is at least four days overdue and happiness is `5` or lower, the employee walks out during a simulation update.

## Departure and Rehire Lock

- Tracked employees leave when happiness reaches `0`; an overdue walkout can also make an employee leave at happiness `5` or lower.
- Employees who leave are locked from rehiring for 90 in-game days.
- Locked candidates are filtered out of the hiring market during the lock period.

## Bonus System (Manage Employees)

- "Give Bonus" is available in Manage Employees
- Bonus spends company cash and increases happiness
- Happiness boost formula:
  - `titleHolderFlag = 3` if the employee currently holds any title, otherwise `1`
  - `currentRank` is the wrestler's position on the Ranking Board
  - `boost = amount / ((perMatchFee - currentRank) * 5) * titleHolderFlag`
  - Boost is rounded to nearest integer and has a minimum of `+1` when divisor is positive
  - If divisor is zero or negative, fallback boost is `titleHolderFlag`

Notes:

- `perMatchFee` comes from the employee contract `perMatchSalary`
- Non-wrestlers use rank `0`

The title-holder multiplier applies to current title holders (3x versus 1x for other eligible employees). The resulting happiness is clamped to `0..100`.

## Low Happiness Warning

- A warning modal appears for tracked employees with happiness below `10`
- Includes employee photo and quick "Give Bonus" action
