# Prestige System

Prestige represents the company's standing in the wrestling world. A new game starts at **10**. Prestige is clamped at zero but has no upper cap.

Primary implementation: [`src/store/useGameStore.js`](../src/store/useGameStore.js)

## Prestige from an Event

When an event is run, the game first calculates an event score:

```text
calculatedPrestigeDelta = round(
    eventHype / 36
  - eventRisk / 42
  + segmentPrestigeBonus
  + (averageMatchWrestlerPopularity / 100) * 2
  + sum((matchRating - 5) * 0.4)
)

eventBaseDelta = round(calculatedPrestigeDelta / 5)
eventPrestigeDelta = eventBaseDelta + rivalryPrestigeBoost + competitorPressurePrestigeImpact
```

The rating term includes rated `match`, `mainEvent`, and `titleMatch` segments. The popularity average includes wrestlers in those match segments.

### Raw segment prestige bonuses

These bonuses contribute to `calculatedPrestigeDelta` before the event score is divided by five; they are not direct prestige points:

| Segment type | Raw bonus |
|---|---:|
| Match | +1 |
| Main Event | +4 |
| Title Match | +3 |
| Promo | +1 |
| Interview | 0 |

### Match rating contribution

The match-rating term is calculated for each rated match segment:

| Match rating | Raw contribution |
|---:|---:|
| 10.0 | +2.0 |
| 8.0 | +1.2 |
| 7.0 | +0.8 |
| 5.0 | 0.0 |
| 3.0 | -0.8 |
| 1.0 | -1.6 |

Ratings use wrestler skill and stamina plus a small random factor. Rivalry heat and competitor performance add separate event-level modifiers after the base score.

## Other Prestige Changes

Prestige can change outside event resolution:

- **Daily competitor simulation:** rival promotions can add or subtract prestige during timeline advancement.
- **Interview consequences:** answer score, professionalism, hype, controversy, and whether the interview was forced affect prestige.
- **Career arcs and onboarding:** configured completion rewards and failure penalties can affect prestige.
- **Board decisions:** an approved competitor-response decision grants prestige.
- **Elite wrestler hiring and firing:** a wrestler with skill `82` or higher changes prestige by `round((skill - 80) / 3)` on hire, and by the negative of that amount on firing.
- **Skipping an event:** prestige falls by a random 5%-10% of its current value, with a minimum one-point decrease before the zero floor is applied.

Skipping an event prevents that event's gate, segment, and event-performance effects. Daily simulation income and expenses still occur when the timeline advances.

## Summary

Event quality is the primary prestige driver, but prestige is also affected by competitors, interviews, progression rewards, board decisions, elite roster changes, and skipped events. See the finance and board-meeting documentation for related cash-flow and governance effects.
