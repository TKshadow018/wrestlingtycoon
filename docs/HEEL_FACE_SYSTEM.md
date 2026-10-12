# Heel / Face System

## Overview

Every wrestler has a `heelFaceMeter` value from **0 to 100**:

- **0 = maximum Face** (beloved babyface)
- **50 = Neutral** (default for all new/hired wrestlers)
- **100 = maximum Heel** (despised villain)

The meter is stored on the employee object and updates automatically after each event.

---

## Stage Labels

| Range | Label |
|-------|-------|
| 0–9 | Babyface |
| 10–19 | Pure Babyface |
| 20–29 | Fan Favorite |
| 30–39 | Crowd Favorite |
| 40–49 | Rising Face |
| 50–59 | Neutral |
| 60–69 | Tweener Heel |
| 70–79 | Heel |
| 80–89 | Dirty Heel |
| 90–99 | Top Heel |
| 100 | Super Heel |

---

## How Alignment Shifts After a Match

Alignment changes are **opponent-based**, not simply win/loss based. What matters is *who* a wrestler beats or loses to — this mirrors real wrestling booking logic.

### Shift Table

| Situation | Base Shift | Reasoning |
|---|---|---|
| Beat a Heel (opponent > 55) | **-3** (toward Face) | You're the hero who slew the villain |
| Lost to a Heel (opponent > 55) | **-1** (slight Face) | Crowd sympathizes with the victim |
| Beat a Face (opponent < 45) | **+3** (toward Heel) | You're the villain who toppled a fan favorite |
| Lost to a Face (opponent < 45) | **+1** (slight Heel) | Expected outcome, slight heat |
| Beat a Neutral | **-1** (slight Face) | Minor crowd pop |
| Lost to a Neutral | **+1** (slight Heel) | Minor loss of credibility |

### Match Rating Multiplier

The base shift is scaled by match quality:

```
shift = round(baseShift × clamp(matchRating / 5, 0.5, 2.0))
```

- Rating **5/10** = 1× multiplier (no change)
- Rating **10/10** = 2× multiplier (shift doubled)
- Rating **1/10** has a raw 0.2× ratio, clamped to the **0.5× minimum**
- Ratings are clamped between **0.5×** and **2.0×**, and the final shift is rounded to a whole meter point
- Missing match ratings default to 5/10 (1× multiplier)

A high-rated main event between a Face and Heel can change alignment twice as much as a mid-card opener.

### Tag Team Matches

For tag team matches, the opponent's alignment is the **average `heelFaceMeter`** of all wrestlers on the opposing team.

---

## Natural Decay When an Event Runs

Whenever an event is actually run, **every active wrestler** drifts **1 point toward Neutral (50)** after that event's match results are applied:

- If `meter > 50` → `meter - 1`
- If `meter < 50` → `meter + 1`
- If `meter = 50` → no change

No alignment decay is applied on a day when no event runs. If multiple events are run on different days, each event run applies its own decay step. This ensures that alignment requires **active booking to maintain**. A heel who stops losing or facing faces will gradually drift back toward neutral over time.

---

## Example Scenarios

### Turning a Neutral into a Face
Book them to consistently **beat Heels** in high-rated matches. A 10/10 win over a Heel shifts them -6 per event. Starting at 50, they'd reach "Fan Favorite" (30) in ~4 events.

### Turning a Face into a Heel
Book them to **beat Faces** in strong matches. A 7/10 win over a Face shifts +4.2 (rounds to +4). Starting at 50, they'd reach "Heel" (70) in ~5 events.

### Maintaining a Heel's Alignment
A Top Heel (meter ~90) needs to keep beating faces or the 1pt/week decay will slowly pull them back toward Neutral. Without active booking they drift ~4 points per month.

---

## Key Files

| File | Role |
|---|---|
| `src/utils/heelFaceMeter.js` | All shift math, decay, stage labels |
| `src/store/useGameStore.js` → `applyMatchStats` | Per-match opponent-based shift calculation |
| `src/store/useGameStore.js` → `applyHeelFaceWeeklyDecay` | Weekly decay applied to all wrestlers |
| `src/components/dashboard/modules/ManageEmployeesModule.jsx` | Displays `Ring Personality: Label (value)` |
