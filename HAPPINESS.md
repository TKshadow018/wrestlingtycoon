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

## Contract Termination and Rehire Lock

- If tracked employee happiness reaches `0`, they terminate immediately
- Their person profile is locked from rehiring for `90` days
- Locked candidates are filtered out of the hiring market during lock period

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

## Low Happiness Warning

- A warning modal appears for tracked employees with happiness below `10`
- Includes employee photo and quick "Give Bonus" action
