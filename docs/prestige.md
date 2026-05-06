# Prestige System

Prestige represents your company's standing and reputation in the wrestling world. It starts at **10** and has no hard cap.

---

## What Affects Prestige

### Events (main driver)

Prestige **only changes when you run an event**. Non-event days have zero prestige movement.

The formula after each event:

```
prestigeDelta = round(
    hype / 36                       — event type hype factor
  - risk / 42                       — event type risk penalty
  + segmentTypeBonus                — sum of bonuses from each segment type
  + (avgWrestlerPopularity / 100) × 2   — quality of wrestlers in matches
  + matchRatingBonus                — sum of (matchRating - 5) × 0.4 per match segment
)
```

#### Segment type bonuses
| Segment type | Prestige bonus |
|--------------|---------------|
| Match        | +1            |
| Main Event   | +4            |
| Title Match  | +3            |
| Promo        | +1            |
| Interview    | 0             |

#### Match rating impact (per match segment)
| Match rating | Prestige contribution |
|-------------|----------------------|
| 10.0        | +2.0                 |
| 8.0         | +1.2                 |
| 7.0         | +0.8                 |
| 5.0         | 0.0 (neutral)        |
| 3.0         | −0.8                 |
| 1.0         | −1.6                 |

Match ratings are driven by: wrestler average skill, stamina at match time, and a small random factor.

#### Wrestler popularity impact
The average popularity (0–100) of all wrestlers who participate in match segments contributes up to **+2 prestige** per event. High-profile rosters consistently lift your prestige ceiling.

#### Can prestige go down from an event?
Yes. A show with no popular wrestlers, low match ratings, and a high-risk event type can produce a **negative** prestigeDelta.

---

### Skipping an Event

If you skip an event (requirements not met and you choose to skip), prestige drops by **5–10%** of its current value (minimum −1). No income is earned.

---

### Hiring an Elite Wrestler

Signing a wrestler with skill **≥ 82** (Elite tier) immediately boosts prestige:

```
hirePrestigeDelta = round((skill - 80) / 3)
```

| Wrestler skill | Prestige boost |
|---------------|---------------|
| 82            | +1            |
| 85            | +2            |
| 90            | +3            |
| 95            | +5            |
| 100           | +7            |

Solid (skill 62–81) and Rookie (skill < 62) hires do **not** affect prestige.

---

### Releasing an Elite Wrestler

Firing a wrestler with skill **≥ 82** reduces prestige by the same magnitude as the hire bonus would have been:

```
firePrestigeDelta = -round((skill - 80) / 3)
```

This reflects the loss of a marquee talent from your roster.

---

## Summary Table

| Trigger                              | Prestige effect            |
|--------------------------------------|---------------------------|
| Non-event day                        | None                      |
| Good event (high ratings, popular wrestlers) | Positive (+varies)  |
| Average event                        | Small positive or neutral |
| Poor event (low ratings, bad roster) | Negative                  |
| Skipping an event                    | −5% to −10% of current    |
| Hiring an Elite wrestler (skill ≥ 82)| +1 to +7                  |
| Releasing an Elite wrestler          | −1 to −7                  |
