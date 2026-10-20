# Match Planning and Event-Based Ratings

## Planning a match

Configure the event card, select **Save & Proceed**, then **Plan Segment** and **Start Segment**.

- **Match overview:** set a duration from 1 to 60 minutes with the keyboard-accessible slider, numeric input, or presets. Reducing duration moves later moments to the new ending minute rather than deleting them.
- **Outcome:** choose a wrestler or tag team, finish, and risk level. Picking a particular winner does not itself improve quality.
- **Props:** select the props available to your moments. Selected-but-unused props do not add a quality bonus.
- **Timeline:** add, edit, duplicate, or remove moments. Cards are displayed in chronological order; equal-minute moments retain their insertion order. Each card summarizes the actor, action, target, time, and prop.
- **Resolve Match:** required-field errors must be corrected first. Guidance about missing escalation, repetition, or turning points is advisory. An empty timeline can resolve, but earns no event-execution credit.

Drafts survive moving between execution segments, closing and reopening the planner, and returning to setup while the event setup screen remains mounted. An intentionally empty timeline stays empty. A failed store validation does not advance the day or discard the draft. Drafts are not a separate persisted autosave: closing the event setup screen or reloading can discard unresolved edits.

The moment cap is 60. The UI disables adding and duplicating at the limit; imported oversized timelines are truncated with diagnostics. Missing or duplicate IDs receive deterministic unique IDs, without time-based collisions.

Targets must be different eligible match wrestlers when required by the action. Prop actions require a supported, selected prop. Removing a selected prop clears only references to that prop; the affected action remains editable and cannot resolve until corrected.

## Rating model

Both authored and simulated matches use the pure [`rateMatch()`](../src/utils/matchRating.js) function. Simulation generates an internal profile through the existing random source; supplying a deterministic `random` function makes profile generation reproducible.

| Component | Weight |
|---|---:|
| Performer capability | 20% |
| Event execution | 25% |
| Match structure | 20% |
| Variety and pacing | 15% |
| Finish coherence | 10% |
| Risk management | 10% |

The weighted score receives a modest context adjustment and is clamped to 1-10, rounded to one decimal place. Performance establishes execution ability; variety, ordering, timing, escalation, turning points, and finish support determine how well the match unfolds. Repetition, clustered moments, weak endings, and excessive unsupported risk can lower quality.

Duration affects pacing expectations and stamina use rather than adding free quality. Actual prop use affects execution and risk and adds stamina drain; unused selections have no positive rating effect. Existing promotion, featured-pairing, and backstage chemistry adjustments still apply after the base rating and are displayed separately in event results.

Action intensity, actor/target participation, duration, risk, and used props also determine each wrestler's stamina loss, capped at 70 per match. Finishing below 20 causes an injury lasting 7-90 days and cancels later matches involving that wrestler. See [STAMINA_AND_INJURIES.md](STAMINA_AND_INJURIES.md) for the exact rules.

## Validation, persistence, and compatibility

[`normalizeMatchPlan()`](../src/data/matchPlanning.js) is the shared schema boundary. It returns `{ plan, errors, warnings, adjustments }`. Diagnostics use stable codes, with optional moment IDs, translated only in the UI.

The store validates again before advancing the calendar or applying event effects. Unsupported actors, required targets/props, supplied winners, finishes, and risk levels cannot silently resolve. Recoverable duration, ID, ordering, and payload-size adjustments are reported. Match-only planning fields are cleared on interviews and promos.

New outcomes persist the normalized timeline, selected props, duration, execution mode, finish, risk, `ratingBreakdown`, and plan diagnostics. The breakdown contains six bounded 0-10 factors, a signed context adjustment, and recognized warning codes. Results distinguish selected props from used props and identify the prop used in each moment.

Legacy segments without planning data remain supported. Default authored moments are created only when opening the planner. Legacy supplied match ratings remain authoritative when no new execution mode is present; new planned/simulated results are scored by the shared engine at the store boundary. Older outcomes without a breakdown still render normally.

All planner, validation, and rating copy is in [`en.json`](../src/i18n/locales/en.json). No environment variables, dependencies, or configuration changes are required.

## Verification

- `npm test` runs schema, rating, UI interactions, draft restoration, store validation/persistence, legacy compatibility, and localization tests.
- `npm run test:coverage` enforces the repository's per-file JavaScript thresholds.
- `npm run build` checks production compilation.

The responsive planner has also been checked in a browser at 375px and 1440px widths, including horizontal overflow, keyboard duration changes, and prop-required validation.
