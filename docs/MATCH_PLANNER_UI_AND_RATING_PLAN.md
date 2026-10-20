# Match Planner UI and Event-Based Rating Plan

**Status:** Approved and implemented

This plan covers the requested improvements to the match planning/play area, stronger validation and persistence, and a rating system driven by what happens during the match rather than mostly by a flat planning bonus.

> Implementation was approved. See [MATCH_PLANNING.md](MATCH_PLANNING.md) for the implemented behavior, rating weights, compatibility rules, and usage.

## 1. Current state and problems

The current planner is functional, but the execution UI is a dense grid of controls inside [EventSetupModal.jsx](../src/components/dashboard/modules/EventSetupModal.jsx). Each planned moment places several fields in one row, which makes the flow difficult to scan, especially on smaller screens.

The current planned-match rating is primarily calculated from:

- Average wrestler skill and stamina.
- Finish and risk bonuses.
- A small fixed bonus per planned moment.
- A small fixed bonus for selected props.
- A small duration bonus.

That means selecting or adding planning data can improve the result without adequately measuring the quality, order, variety, escalation, or actual use of the match events.

The current normalizer in [matchPlanning.js](../src/data/matchPlanning.js) already protects the store from invalid wrestler IDs, props, actions, targets, and minute values. It should be extended into a complete plan-validation boundary shared by the UI, event resolver, and tests.

## 2. Goals

1. Make the match planning area easier to understand and faster to use.
2. Make the planner safe against malformed, stale, incomplete, or excessively large plans.
3. Make match ratings reflect the planned events and their structure.
4. Keep winner selection, finish type, match length, props, tag-team support, simulation, localization, and persisted event results working.
5. Make the rating result explainable to the player through a breakdown instead of presenting an unexplained number.
6. Preserve backward compatibility for saved events and older outcomes that do not contain the new fields.

## 3. Proposed UI redesign

### 3.1 Planner shell

Replace the current dense planner grid with a structured planner shell:

- **Header:** match type, wrestler/team names, and a compact plan status.
- **Match overview card:** match length, pace/risk, and an at-a-glance count of planned moments and selected props.
- **Outcome card:** winner and finish selection grouped together because they describe the match result.
- **Props card:** selectable prop tiles with selected-state styling, not a long undifferentiated checkbox row.
- **Match timeline:** the primary planning surface, displayed as vertically connected event cards.
- **Sticky action footer:** validation status, “Resolve Match,” and a clear way to return without losing the current draft.

The planner should visually separate **what happens during the match** from **how the match ends**.

### 3.2 Timeline event cards

Each planned moment becomes a readable card rather than a wide row:

- A visible minute marker and timeline connector.
- An event number and action category.
- Action selector shown first, since it determines the remaining fields.
- Actor and target displayed as wrestler choices with names and optional avatars.
- Prop selector shown only for a prop-using action.
- Remove and duplicate controls with accessible labels.
- Inline validation messages beside incomplete fields.
- A compact summary sentence, such as “At minute 12, Wrestler A dominates Wrestler B with kicks.”

Cards should support a narrow mobile layout without horizontal scrolling. On desktop, the card can use two columns for the actor/target controls while keeping the action and time prominent.

### 3.3 Match length and pacing controls

Improve the current duration dropdown with:

- A range control from 1 to 60 minutes.
- A numeric value or editable minute field for precise selection.
- Quick duration buttons for common values such as 5, 10, 15, 20, 30, 45, and 60.
- Automatic clamping of existing moments when the duration is reduced.
- A visible indication when a moment was moved because the match became shorter.

The control must remain keyboard accessible and must use localized labels.

### 3.4 Plan guidance and empty states

Add lightweight guidance without hardcoding visible strings:

- Show a recommended opening, escalation, and closing structure.
- Explain that rating is based on the events selected and their order.
- If all moments are removed, show an empty-state card with an “Add first moment” action.
- Display warnings for plans that have no escalation, no near fall/comeback, or too many repeated events. These should be warnings, not blockers, unless a required field is missing.

### 3.5 Results presentation

Update the results view to show:

- The match timeline in the same order as the plan.
- Actual match rating and rating label.
- A rating breakdown with compact bars or labeled factors.
- Selected props versus props actually used in moments.
- Warnings or outcome notes when the plan was normalized or adjusted.

The result view should distinguish between “selected prop” and “used prop” so selecting a chair without using it does not look like a match event.

## 4. Robustness and data-model changes

### 4.1 Central plan schema

Extend [matchPlanning.js](../src/data/matchPlanning.js) into the single source of truth for planning rules.

Add catalog metadata for each action:

- Translation key and category.
- Whether a target is required.
- Whether a prop is allowed or required.
- An intensity/risk profile used by the rating engine.
- A pacing role such as opening, escalation, turning point, or finish-supporting.

Add shared constants for:

- Maximum planned moments per match.
- Valid finish types and risk levels.
- Action categories and rating weights.
- Common duration presets.

### 4.2 Normalization and validation

Create a `normalizeMatchPlan()` result that contains:

- The normalized plan.
- Non-blocking warnings.
- Blocking validation errors suitable for UI display.
- A record of adjustments, such as clamped minutes or removed invalid references.

Validation should enforce:

- Match length is an integer between 1 and 60.
- Every moment has a unique stable ID. Duplicate or missing IDs receive deterministic replacement IDs.
- Moments are sorted chronologically with stable ordering for equal minute values.
- Actors are active match wrestlers.
- Targets are active match wrestlers and cannot equal the actor.
- Actions are supported catalog IDs.
- Actions that require a target cannot be resolved without one.
- Prop actions reference a selected and supported prop.
- Winner selection references an eligible wrestler or a valid tag team.
- Finish type and risk values are supported IDs.
- Plans above the maximum moment count are truncated with a warning rather than crashing or creating an oversized payload.
- Non-match segments cannot retain match-only planning data.

The UI should use this validator before resolving. The store must validate again because persisted or externally supplied data cannot be trusted.

### 4.3 Draft-state safety

Review execution state transitions so that:

- Switching between segments does not overwrite edits from the current segment.
- Returning to a previous segment restores its draft plan.
- Changing duration preserves moments and only clamps affected minute markers.
- Removing a selected prop clears only invalid prop references.
- A failed resolution leaves the planner open with the user’s data intact.
- IDs do not depend only on `Date.now()` and cannot collide during rapid additions.
- Older saved events without planning fields receive a valid default plan only when the planner is opened, without mutating unrelated segment data.

## 5. Event-based match rating model

### 5.1 Principle

The rating should answer: **How well did this specific match unfold?**

Wrestler skill and stamina should establish the performers’ ability to execute the match, but the planned events should determine the match’s structure and quality. Selected props alone should not add meaningful quality; props should matter when they are used in a valid moment and should also increase risk or stamina cost.

### 5.2 Proposed rating components

Create a pure, tested rating function in a dedicated module such as `src/utils/matchRating.js`. The exact weights can be tuned during implementation, but the first version should expose these factors:

| Factor | Purpose |
|---|---|
| Performer capability | Average skill, stamina, and relevant performance attributes establish the execution ceiling. |
| Event execution | Each valid moment is scored using its action type, actor/target capability, and whether required fields are present. |
| Match structure | Rewards a clear opening, escalation, turning point, near fall/comeback, and a finish-supporting sequence. |
| Variety and pacing | Rewards useful action variety and sensible spacing; repeated identical moments or clustered events reduce this factor. |
| Finish coherence | Measures whether the finish and final moments form a believable conclusion. The winner should not automatically receive a rating bonus. |
| Risk management | Rewards meaningful risk when supported by stamina and plan structure, but penalizes excessive chaotic risk or unsafe prop overuse. |
| Match context | Applies modest adjustments for match type, title/main-event importance, stipulation, and event presentation where those values already exist. |

The final score should be clamped to 1–10 and rounded consistently. Avoid the current approach where each moment and selected prop receive an unconditional flat bonus.

### 5.3 Planned and simulated matches

- **Planned match:** score the normalized authored moments directly.
- **Simulated match:** generate a deterministic internal event profile from the existing random seed path or produce a simulated event summary, then score it through the same rating function. This keeps planned and simulated matches comparable while preserving simulation randomness.
- **Props:** selected-but-unused props should not increase the event quality score. A valid prop moment can affect execution, risk, crowd response, and stamina.
- **Duration:** duration should influence pacing and stamina expectations, not grant a free rating bonus. A short match with focused events can rate well; a long match with empty or repetitive planning should not.
- **Winner and finish:** retain their gameplay consequences, but do not let winner choice alone determine match quality.

### 5.4 Explainable rating output

Persist a `ratingBreakdown` object alongside `matchRating`, for example:

- `performerCapability`
- `eventExecution`
- `matchStructure`
- `varietyAndPacing`
- `finishCoherence`
- `riskManagement`
- `contextAdjustment`
- `warnings`

The breakdown should be normalized and sanitized before it reaches the store or result screen. Existing outcomes without this object should continue to render normally.

## 6. Tests to add or update before implementation

Following the repository testing workflow, tests should be updated before implementation changes and intentionally fail for the new behavior where practical.

### Data and rating tests

- Validate action metadata and required-field rules.
- Normalize duplicate/missing IDs deterministically.
- Clamp duration and moment times.
- Reject invalid actors, targets, actions, props, winners, finishes, and risk values.
- Enforce the maximum moment count without throwing.
- Verify that invalid prop references are removed.
- Verify event order, variety, escalation, and finish coherence affect the rating.
- Verify selected-but-unused props do not receive the same benefit as used props.
- Verify invalid or empty plans produce bounded ratings and warnings rather than exceptions.
- Verify planned and simulated inputs use the same rating function.

### Store integration tests

- Persist normalized plans and rating breakdowns through event resolution.
- Preserve tag-team winners and match metadata.
- Keep legacy segments without planning fields compatible.
- Preserve the plan when moving between execution segments.
- Verify a failed plan validation does not resolve or discard the draft.

### UI and localization tests

- Render the redesigned timeline and empty state.
- Add, edit, duplicate, and remove moments.
- Verify duration changes clamp moments without deleting valid data.
- Verify prop actions only expose selected props.
- Verify accessible labels, keyboard controls, and validation messages.
- Add all new visible copy to [src/i18n/locales/en.json](../src/i18n/locales/en.json) and keep locale coverage passing.

## 7. Implementation order after approval

1. Add or update failing data-model and rating tests.
2. Extend the planning catalog and normalization/validation boundary.
3. Add the pure event-based rating engine and its breakdown output.
4. Refactor the planner UI into the overview, outcome, props, timeline, and sticky-footer sections.
5. Add validation feedback, draft-state protection, and robust ID handling.
6. Integrate rating breakdowns and normalized warnings into store outcomes.
7. Update the result screen and styles.
8. Update [EVENTS_AND_MATCHES.md](EVENTS_AND_MATCHES.md) and localization resources.
9. Run focused tests, the full test suite, build, and relevant diagnostics.
10. Review the final diff and report any pre-existing lint failures separately.

## 8. Acceptance criteria

- The play/planning area is readable at desktop and mobile widths without horizontal scrolling.
- A player can understand the match flow from the timeline without opening every control.
- Invalid or incomplete plans are explained and cannot silently resolve into corrupted outcomes.
- A plan’s rating changes because of its actual events, structure, pacing, and finish coherence.
- Selected props do not inflate ratings unless used in valid moments.
- Results show both the planned events and an explainable rating breakdown.
- Existing winner, finish, duration, prop, tag-team, simulation, persistence, and localization behavior remains intact.
- Focused tests, full tests, and the production build pass.

## Approval record

The full plan was approved for implementation. The sections above preserve the original design and acceptance criteria; the usage guide records the delivered behavior.
