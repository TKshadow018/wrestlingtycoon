# Finance / Money System

This file documents how cash and finance values are calculated in the game.

Primary source:
- src/store/useGameStore.js

Config source:
- src/config/gameConfig.js

## Finance State

Core fields in finances:
- cash: current company money
- lastIncome: most recent calculated income total
- lastExpenses: most recent calculated expense total
- lastDelta: lastIncome - lastExpenses for the latest update
- ledger: transaction history (kept to last 120 entries)

Initial values:
- cash = GAME_CONFIG.startingCash (default 500000)
- lastIncome = 0
- lastExpenses = 0
- lastDelta = 0
- ledger = []

## Daily Timeline Cash Update

When timeline advances (proceedTimeline), the game computes:

### 1. Income

- baseIncome = 18000 + round(fans * 0.08)
- sponsorIncome = sum(dailyPayout of non-event-scoped sponsors)
- eventIncome is added if an event is run that day

Total:
- income = baseIncome + sponsorIncome + eventIncome

### 2. Expenses

- payrollCost = round(sum(monthlySalary / 30 for all active employees))
- staffingCost = 5500 + payrollCost
- flat extra operating cost = 3000
- eventExpenses if event runs
- perMatchSalaryExpenses if event runs

Total:
- expenses = staffingCost + 3000 + eventExpenses + perMatchSalaryExpenses

With current code, non-event baseline daily expenses are:
- 5500 + payrollCost + 3000

### 3. Net and cash

- delta = income - expenses
- nextCash = currentCash + delta

Then finances update:
- cash = nextCash
- lastIncome = income
- lastExpenses = expenses
- lastDelta = delta

Ledger entry added with category dailyClose.

## Event Financial Effect

If event setup is provided on a valid event day:

### Event income

eventIncome is based on:
- fan base gate
- event hype
- average employee skill bonus
- setup segment bonuses
- sponsor event multiplier (for sponsorable event types)
- random crowd multiplier

### Event expenses

- eventExpenses = round(2200 + productionScale * 1700 + risk * 60)

### Per-match payouts

When event segments are match segments (match, mainEvent, titleMatch):
- each wrestler appearance adds that wrestler's contract.perMatchSalary
- all payouts are summed into perMatchSalaryExpenses
- this is written as a separate ledger entry with category matchPayroll

## Event Booking / Refund Flows

### Create custom event

Action: createCustomEvent

On create:
- setup cost is charged by event type config (setupCost)
- requires enough cash to book
- cash -= setupCost
- lastExpenses += setupCost
- lastDelta -= setupCost
- ledger category: eventBooking

### Update custom event

Action: updateCustomEvent

On update:
- computes setupCostDelta = newSetupCost - oldSetupCost
- if delta > 0, additional booking cost is charged (cash check required)
- if delta < 0, difference is refunded
- ledger category:
	- eventBooking when delta is positive
	- eventRefund when delta is negative

### Delete custom event

Action: deleteCustomEvent

On delete of current/future event:
- refunds 60% of event setup cost
- cash += refundAmount
- lastIncome += refundAmount
- lastDelta += refundAmount
- ledger category: eventRefund

## Sponsor Money Flows

### Signing sponsor

Action: signSponsor

On signing:
- cash += signingBonus
- lastIncome += signingBonus
- lastDelta += signingBonus
- ledger category: sponsorSigning

### Daily sponsor payouts

During timeline advance:
- non-event-scoped sponsors contribute to daily sponsorIncome

### Sponsor expiry

- non-event-scoped sponsors decrement remainingDays daily
- event-scoped sponsors are consumed/removed after qualifying event execution

## Employee / Roster Money Flows

### Hiring

Action: hireEmployee

Current upfront hiring cost:
- one monthly salary value (upfrontMonthlySalary)

On hire:
- cash -= upfrontMonthlySalary
- lastExpenses += upfrontMonthlySalary
- lastDelta -= upfrontMonthlySalary
- ledger category: hiring

Note:
- negotiated fields may change salary used for hire

### Firing

Action: fireEmployee

Severance:
- severanceCost = round(employee.salary * 0.5)

On fire:
- cash -= severanceCost
- lastExpenses += severanceCost
- lastDelta -= severanceCost
- ledger category: severance

### Employee bonus (happiness bonus)

Action: giveEmployeeBonus

On bonus:
- cash -= bonusAmount
- lastExpenses += bonusAmount
- lastDelta -= bonusAmount
- ledger category: employeeBonus

## Ledger Behavior

Helper: appendLedger

- new entries append to end
- history is capped to most recent 120 entries

Common categories currently used:
- dailyClose
- eventBooking
- eventRefund
- matchPayroll
- sponsorSigning
- hiring
- severance
- employeeBonus
