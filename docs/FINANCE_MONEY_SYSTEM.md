# Finance and Money System

This document describes the current cash flow in the game.

Primary source: [`src/store/useGameStore.js`](../src/store/useGameStore.js)  
Configuration source: [`src/config/gameConfig.js`](../src/config/gameConfig.js)

## Finance State

- `cash`: current company balance. New games use `GAME_CONFIG.startingCash` (default: $500,000).
- `lastIncome`, `lastExpenses`, and `lastDelta`: latest timeline totals; direct transaction actions can also adjust these values.
- `ledger`: recent transaction history, capped at 120 entries.

## Daily Timeline Cash Update

When a game day advances, the timeline calculates income and expenses. **There is no flat daily base-income payment and no fixed $5,500 staffing charge.**

### Income

- **Web subscriptions:** daily revenue is calculated from fans, the subscription fee, and a subscriber rate interpolated between the configured minimum and maximum rates. The default fee is $9.99, with a 30-day billing period.
- **Recurring sponsors:** each non-event-scoped sponsor contributes `round(dailyPayout * trustFactor)`, where `trustFactor = 0.65 + trust / 200`.
- **Merchandise:** active title holders produce daily merchandise income; popular wrestlers who participate in a run event can add event merchandise income.
- **Third-party income:** a daily random chance (default: 3%) grants a configured amount (default range: $1,000-$20,000).
- **Event income:** added only when an event is actually run.

### Event income

Event attendance is selected from the configured range for the event type, using current fans, prestige, and a random crowd factor. Event income combines:

- Ticket gate revenue, adjusted by event-sponsor multipliers.
- Any board-member attendance bonus.
- Configured segment income bonuses.
- Audience-segment spending adjustments.
- The selected ticket price's demand response relative to the dynamic recommended price.

The Event Gate total is calculated as:

```text
audience score = min(fans / fan scale, 1) * fans weight + min(prestige / prestige scale, 1) * prestige weight
base attendance = round(clamp(min audience, max audience, min audience + (max audience - min audience) * audience score * random crowd factor))
price demand factor = selected ticket price demand response relative to the dynamic recommended price
attendance = round(clamp(min audience, max audience, base attendance * price demand factor))
ticket revenue = round(attendance * ticket price)
sponsor-adjusted base gate = round(attendance * ticket price * (1 + total trust-adjusted sponsor multiplier))
board bonus = round(sponsor-adjusted base gate * attending board member bonus percent)
segment bonuses = sum(segment-type income bonuses + promo-format income bonuses)
audience spending adjustment = round(attendance * ticket price * (weighted audience spend multiplier - 1) * 0.08)
event gate = round(sponsor-adjusted base gate + board bonus + segment bonuses + audience spending adjustment)
```

The breakdown records the audience range and the fans/prestige/random inputs used to calculate attendance, the ticket price, each sponsor's trust and effective gate impact, any attending board member, every card segment's income bonus, and audience-segment attendance, share, satisfaction, and spending multiplier. In **Financial Control**, select **Income** and click an Event Gate amount to open this breakdown. Daily rows show their event; monthly and yearly amounts show each contributing event, with the period total below. The overview's retained-timeline Event Gate total is also clickable. Older timeline records created before gate details were saved appear as an archived amount rather than a reconstructed breakdown.

The dynamic recommended ticket price starts from the event type's configured base price and adjusts it using the previous 30-day game-month average rating, rival-brand performance, a bounded random adjustment, and a repeated-regular-weekly penalty. The recommendation is clamped to 50%–150% of the event-type base price and can be overridden by the player. Selected prices are compared with that recommendation when calculating the price demand factor. The recommendation details are retained in the Event Gate breakdown.

Audience satisfaction and attendance shares also affect the event's fan impact. An event date by itself does not produce event income; event setup must be supplied when the event is run. See [DYNAMIC_TICKET_PRICE_PLAN.md](DYNAMIC_TICKET_PRICE_PLAN.md) for the input definitions, fallback behavior, and configuration variables.

### Expenses

- **Recurring monthly payroll:** each employee's contract salary is charged on the contract's 30-day anniversary, not divided into a daily salary cost.
- **Match payroll:** each wrestler appearance pays that employee's `perMatchSalary`.
- **Title-holder match bonus:** active title holders receive an additional appearance bonus using the configured multiplier (default: 50% of the appearance fee).
- **Support-employee appearance payroll:** participating managers, staff, referees, and announcers receive one appearance fee per event. Heavy use can add a configured bonus when they appear in more than the threshold number of segments. Appearance fees apply to all segment types.
- **Staff departments:** assigned Production staff reduce event production expense by up to 10%, and Logistics staff reduce operating cost by up to 10%. These discounts are applied before any board cost relief.
- **Event production:** when an event runs, its type-specific cost is read from `GAME_CONFIG.eventCost` (defaults: regular weekly $2,500, house show $5,000, PPV $15,000, Mega Live $25,000, one-time $12,000, digital-only $3,000).
- **Operating cost:** defaults to `round(1,500 + prestige * 25)`. Active board cost relief reduces this amount.
- **Other daily cost:** a random amount from the configured range (default: $300-$1,500).

Event production expense is separate from the one-time setup fee charged when a custom event is booked. The defaults can be changed through game configuration.

### Daily close

The timeline applies:

```text
income = subscriptions + recurring sponsor income + merchandise
       + third-party income + event income
expenses = monthly payroll + match payroll + title-holder bonuses
         + support-employee appearance payroll + event production + operating cost + other cost
delta = income - expenses
cash = previous cash + delta
```

The daily close is recorded in the timeline and ledger. Board Meeting financial reports sum completed timeline income, expenses, and net for the period; separate one-time transactions such as hiring, event booking, and sponsor signing are not included in that operating-period total.

## Event Booking and Refunds

Custom event booking charges the event type's configured setup cost. It requires enough cash and records an `eventBooking` ledger entry.

- **Update:** the difference between the old and new setup costs is charged or refunded. A more expensive event requires sufficient cash. Positive differences use `eventBooking`; negative differences use `eventRefund`.
- **Delete:** a current or future event refunds 60% of its setup cost, rounded to the nearest dollar. Past events are not refunded.

## Sponsor Money Flows

- **Signing:** adds the signing bonus to cash and records a `sponsorSigning` entry.
- **Daily payouts:** non-event-scoped sponsors contribute trust-adjusted daily payouts.
- **Event sponsors:** event-scoped sponsors contribute to a qualifying event's gate and fan boosts, then are consumed after that event runs.
- **Trust:** event and interview outcomes can change sponsor trust, affecting recurring and event-scoped value.

## Employee and Other Transactions

- **Hiring:** charges one upfront monthly salary value and records a `hiring` entry. Negotiated terms determine the amount used.
- **Firing:** severance is `20 * contract.perMatchSalary + 3 * contract.signingBonus`; it records a `severance` entry.
- **Bonuses and retention:** employee bonuses and approved salary demands are charged to cash and recorded in the ledger.
- **Board decisions:** approved investments can charge cash; cost-control decisions can reduce operating expenses for their active period.

## Common Ledger Categories

Categories include `dailyClose`, `eventBooking`, `eventRefund`, `eventCost`, `matchPayroll`, `staffPayroll`, `monthlyPayroll`, `sponsorSigning`, `hiring`, `severance`, `employeeBonus`, `employeeRetention`, and `boardDecision`. The ledger retains the newest 120 entries.
