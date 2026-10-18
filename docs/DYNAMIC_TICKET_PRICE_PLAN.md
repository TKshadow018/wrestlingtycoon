# Dynamic Ticket Price Plan

This plan extends the ticket-fee system with a dynamic recommended base price. The recommendation starts from the event-type ticket price, then adjusts for recent event quality, rival-brand performance, randomness, and repeated regular-weekly events in the same week.

The dynamic result is a **recommended ticket price**, not a forced price. The player can still choose another value, subject to the existing ticket-fee validation and any future pricing-demand rules.

## Goals

- Replace a purely static pricing reference with a price that reflects current company performance.
- Keep the result understandable through an event-gate breakdown and event-preparation preview.
- Keep recommendations within a safe range of the event-type base price.
- Reward strong recent event ratings and competitive leadership.
- Prevent repeated regular-weekly events in one week from receiving the same pricing recommendation as a normal weekly schedule.
- Preserve the existing attendance model: fans, prestige, event type, audience range, and crowd randomness still calculate the initial audience.

## Implementation status

The first implementation is complete. Dynamic recommendations are calculated by the pricing utility, exposed during event preparation, persisted with event preparation and Event Gate results, and used as the reference for a bounded price-demand attendance adjustment. The player can override the recommendation. Focused tests cover historical ratings, rival ranking, repeated weekly events, ten distinct base-price values, explicit range boundaries, and the event-gate optimum.

## Inputs

### 1. Event-type base price: `x`

Read the event type's configured ticket price from `GAME_CONFIG.economy.audience.byEventType[eventType].ticketPrice`.

Example:

```text
VITE_TICKET_PRICE_REGULAR=5
x = $5
```

The configured value is the anchor for the dynamic calculation. It should not be overwritten by the recommendation.

### 2. Recent rating coefficient: `y`

Use all completed events from the previous game month. Calculate their average event rating, then compare it with the fixed reference rating of `8`.

```text
recent average rating = average(previous month's completed event ratings)
y = recent average rating - 8
```

Example:

```text
ratings = 8.8, 7.5, 7.9, 9.2, 9.4
recent average rating = 8.56, displayed as 8.6
 y = 8.56 - 8 = 0.56
```

Use the full precision value for calculations and round only for display and persisted breakdown data. If the previous month contains no completed events, use `y = 0` and record that the coefficient was neutral because no sample existed.

Recommended safeguards:

- Exclude cancelled, missed, or incomplete events.
- Use the event's final recorded rating, not a preview rating.
- Clamp the rating used by the coefficient to the game's valid rating range.
- Consider clamping `y` to a configured range, such as `-2` to `+2`, so one abnormal month cannot dominate pricing.

### 3. Rival performance adjustment: `z`

Compare the company's recent average rating with the comparable rival brands' recent average ratings. Rank the company from first to last.

The requested adjustment is based on the event-type base price:

| Company position | Adjustment |
|---|---:|
| First | `x × 2/10` |
| Second | `x × 1/10` |
| Third | `x × -1/10` |
| Last | `x × -2/10` |

```text
z = x × rank adjustment
```

The request states `x * -210` for the last position. This plan interprets that as `x * -2/10` because it is consistent with the first three rank adjustments and keeps the result inside the intended price range. This should be confirmed before implementation.

Recommended ranking rules:

- Compare like-for-like ratings over the same previous game month.
- Define whether a rival with no completed event is excluded or assigned a neutral result.
- Use deterministic tie handling, such as shared rank or a stable secondary sort.
- If no comparable rivals exist, use `z = 0` and record a neutral competitive adjustment.
- If there are more than four ranked positions, map all middle positions to a bounded adjustment between the second- and third-place values, or define a configurable rank table.

### 4. Randomizer: `rand`

Generate a controlled random adjustment around zero. The randomizer must not be large enough to push the price outside the final safety range.

Recommended form:

```text
rand = x × random(-r, +r)
```

where `r` is a configurable fraction, such as `0.10` or `0.15`.

The random draw should be recorded in the event breakdown so the player can understand why two similar events received slightly different recommendations. Tests should inject a deterministic random source.

### 5. Same-week regular-event penalty

When resolving a `regularWeekly` event, count how many regular-weekly events have already run during the same game week.

Recommended penalty:

```text
same-week penalty = x × penaltyRate × number of earlier regular-weekly events this week
```

The penalty should be negative and configurable. A starting value of `0.10` means each earlier regular-weekly event reduces the recommendation by `10%` of `x`:

| Earlier regular-weekly events this week | Penalty at `x = $5` and rate `0.10` |
|---:|---:|
| 0 | $0.00 |
| 1 | -$0.50 |
| 2 | -$1.00 |

Apply this penalty only to `regularWeekly`. It should not affect house shows, PPVs, one-time events, digital-only events, or Mega Live unless explicitly added later.

The count must use completed or scheduled same-week regular events according to the intended design. The initial implementation should use events already run before the current event, preventing the current event from penalizing itself.

## Recommended formula

The dynamic recommended price is calculated from the configured base price and all adjustments:

```text
raw price = x + x × y + z + rand + same-week penalty
recommended price = clamp(raw price, 50% × x, 150% × x)
```

Where:

- `x` is the event-type base price.
- `y` is the recent-rating coefficient, `recent average rating - 8`.
- `z` is the rival-performance adjustment.
- `rand` is the controlled random adjustment.
- `same-week penalty` is zero except for repeated `regularWeekly` events.

Because `y` is a rating difference and not a percentage, this formula may be too strong. A safer implementation should introduce a rating sensitivity coefficient:

```text
raw price = x + x × y × ratingSensitivity + z + rand + same-week penalty
```

Suggested initial value:

```text
ratingSensitivity = 0.10
```

With the example average rating of `8.56`:

```text
y = 0.56
rating adjustment = x × 0.56 × 0.10 = x × 0.056
```

For `x = $5`, that contributes approximately `$0.28`, before rival, random, and same-week adjustments.

The final result should be rounded to the game's supported currency precision. Since the current ticket-fee setter rounds to whole dollars, use whole-dollar output unless the UI and economy are intentionally changed to support cents.

## Range behavior

The requested range is:

```text
50% of x < result < 150% of x
```

A strict inequality is difficult when ticket prices are whole dollars. The implementation should choose and document one of these rules:

### Recommended rule: inclusive safety bounds

```text
result = clamp(raw price, 0.5 × x, 1.5 × x)
```

This is predictable and works with integer rounding. For `x = $5`, the permitted result is `$2.50` to `$7.50`, which becomes `$3` to `$8` after whole-dollar rounding depending on the rounding order.

### Alternative rule: strict post-rounding bounds

Calculate the integer bounds first and force the output strictly inside them. This can produce no valid value for very small base prices, so it should only be used if the game supports decimal ticket prices or a minimum price of at least `$2`.

The recommended plan is to use inclusive bounds and make the lower/upper multipliers configurable.

## Worked example

Assume:

```text
x = $5
previous-month average rating = 8.56
y = 0.56
company rank = first
z = $5 × 0.20 = $1.00
random adjustment = -$0.25
no previous regular-weekly event this week
ratingSensitivity = 0.10
```

Then:

```text
rating adjustment = $5 × 0.56 × 0.10 = $0.28
raw price = $5 + $0.28 + $1.00 - $0.25 + $0 = $6.03
recommended price = clamp($6.03, $2.50, $7.50)
whole-dollar recommendation = $6
```

The player may use `$6` as the ticket fee, but the event resolver should still use the player's selected fee rather than silently replacing it with the recommendation.

## Interaction with current attendance

The current attendance flow should remain intact during the first implementation:

```text
base attendance = event range + fans + prestige + crowd factor
recommended ticket price = dynamic pricing formula
player-selected ticket price = player choice, defaulting to recommendation only when no choice exists
 ticket revenue = final attendance × player-selected ticket price
```

The implementation applies a bounded price-demand factor after the current base attendance has been calculated. The dynamic recommendation does not replace the fans/prestige/event-range calculation; it supplies the reference price used to evaluate the player's selected fee.

This separation avoids double-counting:

- Fans and prestige determine the initial audience.
- Dynamic pricing determines the recommended fee.
- The price-demand model determines how the selected fee changes attendance relative to that recommendation.
- Sponsors, board bonuses, and audience spending use the final resolved attendance and selected fee.

## Data and configuration changes

Add configuration for the new behavior rather than hardcoding balancing values:

```text
VITE_TICKET_PRICE_DYNAMIC_ENABLED=true
VITE_TICKET_PRICE_RATING_REFERENCE=8
VITE_TICKET_PRICE_RATING_SENSITIVITY=0.10
VITE_TICKET_PRICE_MIN_MULTIPLIER=0.50
VITE_TICKET_PRICE_MAX_MULTIPLIER=1.50
VITE_TICKET_PRICE_RANDOM_RANGE=0.10
VITE_TICKET_PRICE_REGULAR_REPEAT_PENALTY=0.10
```

The rival rank adjustment should be represented as a configuration object or stable constants for first, second, third, and last place. Do not store translated labels as game-state values.

Persist the following in the event-gate breakdown or event-preparation result:

- `baseTicketPrice` (`x`)
- `recentAverageRating`
- `ratingReference`
- `ratingCoefficient` (`y`)
- `ratingAdjustment`
- `rivalRank`
- `rivalAdjustment` (`z`)
- `randomAdjustment` (`rand`)
- `sameWeekRegularEventCount`
- `sameWeekPenalty`
- `rawRecommendedPrice`
- `recommendedTicketPrice`
- `priceLowerBound`
- `priceUpperBound`
- whether the recommendation used a neutral fallback because data was missing

## Implementation phases

### Phase 1: Calculation and data contracts

- Add pure, deterministic helpers for recent-month ratings, rival ranking, same-week event counting, random adjustment, and final price clamping.
- Define the missing-data behavior for no previous events, no rival data, and incomplete rival data.
- Confirm whether the last-place adjustment is `-2/10` rather than the written `-210`.
- Add unit tests for each coefficient and boundary.

### Phase 2: Configuration and store integration

- Add the new environment-backed settings to `gameConfig.js`.
- Calculate the recommendation when event preparation opens or when the event type changes.
- Preserve a player's manually entered ticket price; do not overwrite it when game state updates.
- Fix the existing zero-fee truthy fallback so `$0` remains a valid selected price.
- Use the dynamic recommendation as the default or suggested value without overwriting an explicit player selection.
- Apply the selected-price demand factor after the existing base attendance calculation.

### Phase 3: UI and explanation

- Display the recommended ticket price, price range, and short explanation in event preparation.
- Show the main contributing factors: recent rating, rival rank, randomness, and repeated-week penalty.
- Add localized copy for every visible label, tooltip, hint, and accessibility description.
- Add a breakdown view after the event so the recommendation can be compared with the selected price and actual gate result.

### Phase 4: Validation and balancing

- Test base prices of `$5`, `$20`, `$45`, and `$65`.
- Test first, second, third, and last rival positions.
- Test rating averages below, equal to, and above `8`.
- Test no previous-month events and no available rivals.
- Test repeated regular-weekly events in the same week.
- Test minimum and maximum clamp boundaries and deterministic random values.
- Compare recommended price, attendance, ticket revenue, sponsor revenue, expenses, and net event income across early-, mid-, and late-game states.
- Update the existing ticket-fee improvement documentation after tuning the final coefficients.

## Acceptance criteria

The plan is ready for implementation when:

- Every event type produces a recommendation from its own configured base price.
- Recent event ratings affect the recommendation through a documented coefficient.
- Rival performance affects the recommendation using deterministic rank rules.
- Randomness is bounded, injectable in tests, and visible in the breakdown.
- Repeated regular-weekly events receive a configurable penalty and other event types do not.
- The final recommendation stays within the configured `50%` to `150%` bounds.
- Missing historical or rival data produces a neutral, explainable result.
- The player can override the recommendation.
- The recommendation does not replace or double-count the current attendance calculation.
- All new user-facing text is localized.
