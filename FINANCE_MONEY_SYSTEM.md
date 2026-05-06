# Finance / Money System

This file documents how cash and finance values are calculated in the game.

Primary source:
- src/store/useGameStore.js

Config source:
- src/config/gameConfig.js

## Finance State

Core fields in `finances`:
- `cash`: current company money
- `lastIncome`: most recent calculated income total
- `lastExpenses`: most recent calculated expense total
- `lastDelta`: `lastIncome - lastExpenses` for the latest update
- `ledger`: transaction history (kept to last 120 entries)

Initial values:
- `cash = GAME_CONFIG.startingCash` (default 500000)
- `lastIncome = 0`
- `lastExpenses = 0`
- `lastDelta = 0`
- `ledger = []`

## Daily Timeline Cash Update

When timeline advances (`proceedTimeline`), the game computes:

### 1. Income

- `baseIncome = 18000 + round(fans * 0.08)`
- `sponsorIncome = sum(dailyPayout of non-event-scoped sponsors)`
- `eventIncome` is added if an event is run that day

Total:
- `income = baseIncome + sponsorIncome + eventIncome`

### 2. Expenses

- `payrollCost = 0` (currently hardcoded)
- `staffingCost = 5500 + payrollCost`
- Flat extra operating cost: `3000`
- `eventExpenses` if event runs

Total:
- `expenses = staffingCost + 3000 + eventExpenses`

With current code, non-event baseline daily expenses are:
- `5500 + 3000 = 8500`

### 3. Net and cash

- `delta = income - expenses`
- `nextCash = currentCash + delta`

Then finances update:
- `cash = nextCash`
- `lastIncome = income`
- `lastExpenses = expenses`
- `lastDelta = delta`

Ledger entry added with category `dailyClose`.

## Event Financial Effect

If event setup is provided on a valid event day:

### Event income

`eventIncome` is based on:
- fan base gate
- event hype
- average employee skill bonus
- setup segment bonuses
- sponsor event multiplier (for sponsorable event types)
- random crowd multiplier

### Event expenses

- `eventExpenses = round(2200 + productionScale * 1700 + risk * 60)`

## Sponsor Money Flows

### Signing sponsor

Action: `signSponsor`

On signing:
- `cash += signingBonus`
- `lastIncome += signingBonus`
- `lastDelta += signingBonus`
- Ledger category: `sponsorSigning`

### Daily sponsor payouts

During timeline advance:
- Non-event-scoped sponsors contribute to daily `sponsorIncome`

### Sponsor expiry

- Non-event-scoped sponsors decrement `remainingDays` daily
- Event-scoped sponsors are consumed/removed after qualifying event execution

## Employee / Roster Money Flows

### Hiring

Action: `hireEmployee`

Current upfront hiring cost:
- one monthly salary value (`upfrontMonthlySalary`)

On hire:
- `cash -= upfrontMonthlySalary`
- `lastExpenses += upfrontMonthlySalary`
- `lastDelta -= upfrontMonthlySalary`
- Ledger category: `hiring`

Note:
- Negotiated fields may change salary used for hire.

### Firing

Action: `fireEmployee`

Severance:
- `severanceCost = round(employee.salary * 0.5)`

On fire:
- `cash -= severanceCost`
- `lastExpenses += severanceCost`
- `lastDelta -= severanceCost`
- Ledger category: `severance`

### Employee bonus (happiness bonus)

Action: `giveEmployeeBonus`

On bonus:
- `cash -= bonusAmount`
- `lastExpenses += bonusAmount`
- `lastDelta -= bonusAmount`
- Ledger category: `employeeBonus`

## Ledger Behavior

Helper: `appendLedger`

- New entries append to end
- History is capped to most recent 120 entries

Common categories currently used:
- `dailyClose`
- `sponsorSigning`
- `hiring`
- `severance`
- `employeeBonus`

## Important Current Limitations

- `payrollCost` is currently hardcoded as `0` in daily close calculation.
- Per-match salary is tracked on contracts but not directly charged as a separate ledger item in daily close logic.
- Some translation categories mention `eventBooking`/`eventRefund`, but current store logic primarily records `dailyClose` plus action-specific entries above.
