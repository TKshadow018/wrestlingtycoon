# Match Stamina and Injuries

## Stamina costs

Authored and simulated matches use the same per-wrestler calculation in [matchHealth.js](../src/utils/matchHealth.js). Costs are deterministic for a given timeline; the injury recovery period is random.

Each participant starts with a base cost of `12 + durationMinutes * 0.4`, plus 0 for balanced, 4 for risky, or 8 for chaotic pacing. Each valid moment adds costs to its actual actor and target:

| Participant | Action cost |
|---|---|
| Actor | `2 + intensity * 4 + risk * 2` |
| Target, when present | `1 + intensity * 3 + risk * 2` |

Action intensity and risk come from the shared match-action catalog. Wrestlers not involved in a moment do not receive its additional cost. Invalid moments do not receive action or prop costs.

An actual, valid prop action adds the following impact to its actor and 1.5 times that amount to its target:

| Prop | Impact |
|---|---:|
| Chair | 4 |
| Table | 6 |
| Ladder | 7 |
| Kendo stick | 3 |
| Steel steps | 6 |
| Announce table | 8 |

Selecting a prop without using it costs nothing extra. The final calculated loss is rounded up and capped at **70 per wrestler per match**. Stamina cannot fall below zero, and the reported loss is the amount actually deducted. The limit is per match, not per event: multiple matches can consume more than 70 in total.

The store recomputes costs for new authored/simulated executions instead of trusting supplied stamina-loss values. Legacy explicit loss values remain compatible, but are capped at 70. The old random 20-50 base-loss model is replaced for newly calculated matches.

Daily stamina regeneration remains 10, capped at 100. As in the existing timeline workflow, regeneration is applied once before that day's matches are resolved. Matches then consume stamina in card order, without additional regeneration between matches.

## Injuries

A wrestler finishing a match with **strictly less than 20 stamina** becomes injured. Exactly 20 does not cause an injury.

The recovery duration is uniformly drawn from **7 through 90 in-game days**, inclusive. Three months is represented as 90 days, consistent with the game's 30-day month. Recovery is automatic on `returnDay`; regeneration to high or full stamina does not end an injury early.

Assigned Medical staff reduce the rolled recovery duration by a skill-based percentage, capped at 15%. The seven-day minimum remains, and medical support does not change the stamina threshold or prevent injuries.

Backstage incidents use a separate recurring schedule. The first check occurs after **90 game days**; after each incident, the next check is scheduled **60–120 days** later, inclusive. When the timer expires, one active, uninjured roster wrestler receives one of 20 localized injury reasons and is unavailable for **14–60 days**, inclusive. Backstage injuries do not apply match stamina costs or Medical staff reductions. An acknowledgement modal reports the wrestler, reason, and return day, and the countdown is visible in employee management.

If no eligible wrestler is on the active roster when the timer expires, it stays at zero and checks again each game day until a wrestler is available. The timer, pending incident, injury reason, and recovery dates are saved. The pending modal must be acknowledged before the timeline can advance again.

Match-injury state is language-neutral:

```json
{
  "type": "exhaustion",
  "occurredDay": 10,
  "returnDay": 24
}
```

Backstage injury state additionally stores a stable `reasonId`; translated reason labels are display-only.

Injured wrestlers remain employed and keep their normal contracts, roster membership, rankings, titles, and salary obligations. They cannot be assigned to matches, including title cash-ins, until recovery. Non-match promo/interview appearances are still permitted. Roster cards and details show the remaining absence and return day.

## Same-card cancellations

If a match causes an injury, subsequent matches involving that wrestler are cancelled. The entire affected match is cancelled, including tag matches; opponents are not substituted.

Cancelled matches:

- Do not drain stamina or cause additional injuries.
- Do not grant wins, losses, match-history entries, title changes, match-quality rewards, or segment bonuses.
- Do not charge per-match wrestler or support-staff fees.
- Are excluded from performed-match counts, sponsor content profiles, and match-format recommendations.
- Stay visible in event results and history with a cancellation explanation.

The event's fixed production and normal operating costs still apply.

The execution screen previews stamina and warns when a match will cause an injury. Later affected matches are disabled when the earlier result is known. The store always resolves the final card chronologically and remains authoritative if matches were previewed out of order or earlier plans changed. Exact recovery days are drawn when the event is committed.

## Persistence and compatibility

Injuries, actual per-match losses, recovery dates, and cancellation results persist through normal saves, exports, and reloads. Older saves without backstage scheduling data start the timer at 90 days; existing match-injury records continue to be normalized. Invalid injury records are normalized; exhaustion durations remain bounded to 7-90 days and backstage durations to 14-60 days.

No dependencies, environment variables, or configuration files are added. The rule constants live in [matchHealth.js](../src/utils/matchHealth.js), and all visible messages are localized through [en.json](../src/i18n/locales/en.json).

## Tests

Run `npm test` and `npm run test:coverage`. Health tests cover action and prop differences, actor/target involvement, unused props, the exact 70-point cap, the 19/20 injury boundary, both recovery-duration endpoints, recovery-day availability, same-card cancellation, save/reload, legacy values, and UI availability/results.
