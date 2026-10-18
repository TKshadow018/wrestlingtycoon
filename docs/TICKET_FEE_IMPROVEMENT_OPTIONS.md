# Ticket Fee Improvement Options

This document proposes three ways to improve the ticket-fee system after lowering the base ticket prices in `src/config/gameConfig.js`.

## Current behavior

Ticket fee currently acts as a direct event-income multiplier:

```text
ticket revenue = attendance × ticket fee
```

Attendance is calculated separately from fans, prestige, event type, and a random crowd factor. Sponsors, board attendance, segment bonuses, and audience spending adjustments then build on the ticket-based revenue.

The current system is simple and predictable, but it does not model price sensitivity. A higher price increases revenue without reducing attendance, so the most profitable choice is generally the highest affordable fee.

> Implementation note: the current resolver uses a truthy fallback when reading a saved fee. A fee of `$0` therefore falls back to the configured default instead of remaining free. Any approach below should replace that fallback with an explicit missing-value check.

## Current attendance model

Before choosing a ticket-fee model, it is important to understand that attendance is currently calculated independently from ticket price.

The event resolver selects the event type's configured minimum and maximum audience, then calculates a normalized crowd score:

```text
fan factor = min(current fans / fan scale maximum, 1)
prestige factor = min(current prestige / prestige scale maximum, 1)
audience score = fan factor × fans weight + prestige factor × prestige weight
crowd factor = random value between configured minimum and maximum
base attendance = round(clamp(min audience, max audience,
	min audience + (max audience - min audience) × audience score × crowd factor))
```

With the current defaults, fan scale is `10,000`, prestige scale is `100`, fans contribute `55%`, prestige contributes `45%`, and the crowd factor ranges from `0.7` to `1.3`. The event type determines the audience range:

| Event type | Minimum audience | Maximum audience | Base ticket fee |
|---|---:|---:|---:|
| Regular weekly | 200 | 5,000 | $25 |
| House show | 200 | 5,000 | $20 |
| Digital only | 200 | 5,000 | $5 |
| PPV | 5,000 | 20,000 | $45 |
| One-time | 5,000 | 20,000 | $45 |
| Mega Live | 15,000 | 80,000 | $65 |

The current audience-segment calculation happens **after** this base attendance is determined. Casual, Hardcore, Family, and Online segments divide the existing audience and provide satisfaction, fan impact, and spending multipliers; they do not currently create additional attendance. Also, the event resolver currently passes `overallRating: null` into the segment breakdown, so any future price response should not assume that the segment quality factor is already influencing attendance.

### What this means for ticket-fee design

- Ticket price currently changes revenue but not the number of people attending.
- A demand model must be inserted between `base attendance` and the final attendance used for revenue.
- Segment pricing should adjust the segment allocation or segment attendance only after the base audience has been calculated, unless the system is intentionally redesigned to let segments determine total attendance.
- A ticket-fee change can have a large revenue effect because attendance is often bounded by the event type's range. For example, a Mega Live has a much larger audience ceiling than a regular weekly event before price is considered.
- The random crowd factor can hide small pricing effects. Pricing effects should therefore be bounded, recorded, and shown separately from the random attendance result.
- The event type and base fee should remain separate concepts. The event type defines the audience range, while the configured fee defines the price reference.

### Decision constraints

Any improved system should preserve these constraints unless a broader attendance redesign is intended:

1. Attendance must remain within the event type's configured minimum and maximum.
2. Fans and prestige must remain the primary drivers of the initial audience estimate.
3. Randomness should create variation without overwhelming the pricing effect.
4. Sponsors, board attendance, and segment spending should use the final adjusted attendance consistently.
5. Existing audience segments should not be counted twice—once to calculate attendance and again to calculate spending—without explicit balancing.
6. Event breakdowns should distinguish base attendance from price-adjusted attendance so players can understand the result.

## Approach 1: Demand-sensitive ticket pricing

### Concept

Make attendance respond to the ticket fee. Lower prices attract more attendees, while higher prices produce more revenue per attendee but reduce demand.

A simple model could compare the selected fee with the event's base fee:

```text
price ratio = selected fee / base fee
price demand factor = clamp(price ratio ^ -elasticity, minimum factor, maximum factor)
adjusted attendance = round(base attendance × price demand factor)
ticket revenue = adjusted attendance × selected fee
```

For example, an elasticity of `0.35` would create a moderate response rather than making small price changes overly punishing.

### Recommended rules

- Use the event type's configured base ticket price as the reference price.
- Keep a minimum attendance floor so an event cannot become empty solely because of price.
- Apply the price effect before sponsor and board calculations.
- Record the base fee, selected fee, demand factor, and adjusted attendance in the event breakdown.
- Consider a stronger elasticity for regular weekly shows and a weaker elasticity for premium events.

### Advantages

- Creates a meaningful pricing decision.
- Makes the newly lowered base prices useful as an entry point for audience growth.
- Prevents unlimited revenue increases from simply raising the fee.
- Uses the existing attendance and event-gate systems without requiring a new resource.

### Risks

- The formula needs tuning to avoid making high prices unusable.
- Random crowd variation can obscure the effect unless the breakdown explains it clearly.
- Existing saves may produce different event revenue after the rule is introduced.

### Best fit

Choose this approach if ticket pricing should be a strategic management decision with a direct trade-off between volume and price.

## Approach 2: Audience-segment price tolerance

### Concept

Use the existing Casual, Hardcore, Family, and Online audience segments to model different reactions to ticket prices. Each segment receives a price-tolerance value, and the event calculates attendance and spending using the weighted response of its audience.

Example segment tolerances:

| Audience segment | Relative price tolerance | Expected behavior |
|---|---:|---|
| Casual | 0.85 | More sensitive to price |
| Hardcore | 1.20 | More willing to pay for major cards |
| Family | 0.75 | Sensitive to affordability |
| Online | 0.65 | More likely to prefer digital access |

A segment's attendance share could be adjusted using:

```text
segment demand factor = clamp((selected fee / reference fee) ^ -segment elasticity, minimum, maximum)
segment attendance = base segment attendance × segment demand factor
```

The existing `spendMultiplier` could remain separate so that willingness to pay and merchandise or concession spending are not conflated.

### Recommended rules

- Use event type and event quality to change the reference fee or elasticity.
- Let strong hype, rivalry heat, and premium cards improve price tolerance, especially for Hardcore and Online audiences.
- Let Family and Casual audiences respond more strongly to discounts.
- Add a small satisfaction effect when the fee is affordable or excessive for a segment.
- Display segment-level price response in the event-gate breakdown.

### Advantages

- Builds directly on an audience-segment system already present in the game.
- Makes card quality and audience composition matter financially.
- Supports different strategies: affordable mass-market shows, premium hardcore events, or digital-focused events.
- Gives the player richer post-event feedback than a single attendance number.

### Risks

- More complex to balance and explain.
- A player may find the result difficult to predict without a pricing preview.
- Requires careful separation between attendance response, ticket revenue, and audience spending.

### Best fit

Choose this approach if the game should emphasize booking identity and matching ticket prices to the audience a promotion has built.

## Approach 3: Price bands, previews, and reputation effects

### Concept

Keep attendance mostly stable, but make ticket fees interact with event positioning and customer expectations through price bands. This is the least invasive approach and is suitable if the lower base prices are intended to keep the economy straightforward.

Each event type can define three bands relative to its base fee:

```text
value price:       below 90% of base fee
standard price:    90% to 115% of base fee
premium price:     above 115% of base fee
```

The band can influence small, bounded effects:

- Value pricing: modest fan-growth bonus and reduced gate revenue per attendee.
- Standard pricing: neutral result.
- Premium pricing: modest prestige or sponsor upside for major events, but a small fan-satisfaction penalty if event quality is not high enough.

### Recommended rules

- Show the player a preview containing estimated attendance, ticket revenue, and net event income.
- Gate premium pricing behind event quality, hype, prestige, or event type.
- Apply only small bounded attendance changes, for example between `-10%` and `+8%`.
- Add a temporary fan or satisfaction effect when the price is inappropriate for the event quality.
- Keep the base fee as the main balancing control in `gameConfig.js`.

### Advantages

- Easier to understand and balance than a full demand simulation.
- Preserves much of the current event-income behavior.
- Makes lower base fees meaningful without making revenue highly volatile.
- Provides clear player feedback before committing to an event.

### Risks

- Pricing may still feel less consequential than in a demand model.
- Band thresholds can create noticeable behavior changes near the boundary.
- Requires UI work for the estimate preview and pricing explanation.

### Best fit

Choose this approach if the priority is better player communication and controlled economic tuning rather than deep simulation.

## Combined implementation plan

The three approaches work best as layers rather than competing alternatives:

1. **Price bands provide the player-facing strategy.** Classify the selected fee as value, standard, or premium relative to the event type's base fee. Show the band, expected effects, estimated attendance, ticket revenue, sponsor impact, and estimated net event income before the event is confirmed.
2. **Demand sensitivity modifies the existing base attendance.** Do not replace the current fans/prestige/event-range calculation. Use its result as `base attendance`, then calculate a bounded demand factor from the price ratio. The standard band should be close to neutral; value pricing should increase attendance modestly; premium pricing should reduce attendance unless the event has enough hype or quality.
3. **Audience-segment tolerance refines the existing audience allocation.** First calculate the current base attendance, then apply segment-specific price factors to the four audience groups. Normalize the adjusted segment counts back to the allowed total so segment pricing does not accidentally exceed the event type's maximum audience. Use the resulting mix for satisfaction, fan impact, and spending.
4. **Event quality moderates premium pricing.** Hype, overall rating, rivalry heat, event type, and presentation should improve the price tolerance of the most committed audiences. Premium pricing on a weak card should create a larger satisfaction or fan-growth penalty.
5. **Revenue calculations use adjusted attendance.** Ticket revenue, sponsor gate boosts, board bonuses, and audience spending adjustments should all use the final price-sensitive attendance. Segment bonuses that are unrelated to attendance should remain separate.
6. **The event breakdown explains every layer.** Persist the base fee, selected fee, price ratio, price band, overall demand factor, segment demand factors, adjusted attendance, and any fan or satisfaction effects alongside the existing gate breakdown.

### Suggested calculation flow

```text
base attendance = existing fans/prestige/event/random attendance result
price ratio = selected fee / event type base fee
price band = value, standard, or premium
overall demand factor = bounded price-band and quality adjustment
price-adjusted attendance = bounded base attendance × overall demand factor
base segment attendance = current segment allocation of price-adjusted attendance
segment demand factors = bounded segment-specific price adjustments
adjusted segment attendance = base segment attendance × segment demand factor
normalized segment attendance = adjusted segments rescaled to price-adjusted attendance
ticket revenue = adjusted attendance × selected fee
sponsor and board bonuses = calculated from adjusted ticket revenue
audience spending adjustment = calculated from normalized segment mix and selected fee
final event income = gate revenue + bonuses + spending adjustment
```

### Phased delivery

#### Phase 1: Safe foundation and player visibility

- Fix zero-fee handling with an explicit `undefined`/`null` check instead of a truthy fallback.
- Add price-band and price-ratio helpers with configurable thresholds.
- Add an event-preparation estimate showing price band, estimated attendance, ticket revenue, and net event income.
- Persist the selected fee and pricing inputs in the event outcome.
- Add tests for low, standard, high, and zero ticket fees.

#### Phase 2: Overall demand response

- Add a bounded overall demand factor based on price ratio.
- Apply it to the existing base attendance after fans, prestige, event range, and random crowd factor are calculated.
- Clamp the result to the configured event-type minimum and maximum.
- Keep standard pricing near neutral and cap the effect of unusually low or high prices.
- Let event hype, quality, and event type moderate premium-price penalties.
- Apply adjusted attendance before sponsor, board, and audience-spending calculations.
- Add tests proving that value pricing can increase attendance and premium pricing can reduce it without producing negative or impossible attendance.

#### Phase 3: Audience-segment response

- Add configurable tolerance or elasticity values for each audience segment.
- Adjust the existing segment allocation using the selected fee and event reference fee, then normalize segment counts back to the price-adjusted total attendance.
- Let event type, rivalry heat, and card quality influence segment tolerance.
- Decide whether to pass the real event rating into the segment calculation; do not rely on the current `overallRating: null` behavior for pricing balance.
- Keep `spendMultiplier` separate from price tolerance to avoid double-counting audience willingness to spend.
- Add segment-level pricing details to the event-gate modal and postmortem.
- Add tests for different audience mixes and confirm that the same fee can produce different results for different event cards.

#### Phase 4: Balance, migration, and feedback

- Tune the lower base prices using net event income, attendance, fan change, and event expenses rather than ticket revenue alone.
- Compare value, standard, and premium strategies across early, mid-game, and high-prestige states.
- Preserve old saves by treating missing pricing metadata as standard pricing with neutral modifiers.
- Add telemetry or debug-only logging for price ratio, attendance change, and event profitability during balancing.
- Update the finance documentation and localization copy whenever the pricing preview or explanation changes.

## Final recommendation

Implement all three approaches in the phased order above. Start with **Approach 3** because it gives players understandable choices and a safe preview. Add **Approach 1** next so price changes have a real attendance trade-off. Finish with **Approach 2** so audience composition and event identity determine which prices work best.

This sequence limits economic risk: each phase is independently testable, existing event formulas remain recognizable, and the player receives more explanation before deeper pricing behavior is introduced.
