# Product Systems and Follow-Ups

This document separates systems already present in the game from ideas that are still candidates for future work.

## Implemented Systems

- **Career arcs:** eight-week objectives track fan, prestige, and cash progress, award configured rewards, and record completed or failed arcs.
- **Career-arc unlocks:** completing arcs grants new venues, featured-match campaigns, promo formats, and event-intro presentations; unlock state is persisted with progression.
- **Rivalry heat:** wrestler-pair rivalries gain heat from match interactions, decay after events, and influence event fan and prestige results.
- **Faction storylines:** wrestler/manager factions develop rivalries through promos, interference, and betrayals. Betrayals move members between factions and affect crowd response.
- **Backstage chemistry:** shared segment bookings, rival matchups, faction ties, interference, and betrayal change relationship scores. Chemistry modifies match ratings and tracked-role happiness.
- **Audience segments:** Casual, Hardcore, Family, and Online audience groups have different satisfaction and spending responses to an event card.
- **Morale and contract demands:** low-happiness wrestlers and staff can request salary changes; wrestlers can also request title shots. Unresolved demands can cause walkouts.
- **Sponsor reputation:** interviews and event outcomes adjust sponsor trust; higher-tier offers have track-record, brand-safety, and family-audience gates.
- **Competitor simulation:** rival promotions can counter-program, sign market talent, poach vulnerable employees, and publish industry headlines.
- **Persistent competitor strategies:** rival profiles rotate between talent acquisition, counter-programming, and audience expansion; news records strategy changes and rivals can copy wrestler archetypes.
- **Interview consequences:** answer quality affects fans, prestige, and sponsor trust.
- **Interview story consequences:** players select a featured wrestler and optional rival before the interview. Per-answer controversy shifts the featured wrestler toward Heel while professionalism and hype shift them toward Face; rivalry heat responds to controversy/hype versus professionalism, with bounded changes.
- **Event postmortem:** event results show fan, prestige, and financial drivers. When at least three current matches use one format for 60% or more of the card, and that format also appeared in at least two of the last three successful events, the report recommends a different stipulation.
- **Guided onboarding tutorial:** the 21-day rescue challenge guides players through event-ready staffing, three weekly shows, and operating-cash stabilization, with step-specific dashboard actions.
- **Mod data packages:** dashboard import/export supports validated title properties, sponsors, event templates, wrestler archetypes, modded free-agent roster entries, and custom venues.
- **Board governance:** monthly meetings include finance review, agenda decisions, weighted votes, mandates, annual elections, and manager-dismissal outcomes.
- **Persistent competitor strategies:** rival promotions rotate through talent acquisition, counter-programming, and audience expansion; competitors can copy a wrestler archetype once and publish strategy/gimmick news.

## Remaining Follow-Up Ideas

- Add interactive acknowledgements/checkpoints to the guided tutorial.
- Apply venue rent and facility ratings to event audience and expense formulas.
- Allow players to respond to rival strategy shifts through targeted counter-actions.

## AI Interview Improvement Plan

The interview uses local WebLLM for journalist dialogue, while deterministic JavaScript heuristics determine answer quality and game effects. This plan prioritizes reliable gameplay and meaningful choices before expanding the AI's role. Items are proposed unless marked complete in the progress note below.

**Progress (October 16, 2026): All four AI interview phases are implemented.** Turns commit atomically and retry safely; exhausted model setup can be retried; questions use available game context and localization; deterministic relevance/clarity scoring and conservative contradiction checks control optional follow-ups; players can skip or finish early; wrestler/rival effects are disclosed; consequence previews share the store formula; both dialogs support keyboard focus management and live announcements; tests and [docs/AI_INTERVIEWS.md](docs/AI_INTERVIEWS.md) cover the behavior. The current rubric remains lexical and English-only, so future language support should add locale resources and language-aware scoring rather than treating keyword overlap as semantic understanding.

### Phase 1 — Make interviews reliable

- Treat submitting an answer as one atomic turn: preserve the draft while inference runs, and only add the player answer, journalist response, and score after the turn succeeds. On failure, show a recoverable error and let the player retry without duplicated or unscored transcript entries.
- Reconcile interview model names shown in game state with the actual WebLLM candidate list. Make model download, initialization, fallback, and retry states understandable to players.
- Ensure every service outcome satisfies the UI contract. In particular, fallback responses must not silently claim a counter-question exists when none was generated; provide a clear retry, continue, or end-interview path.
- Add focused regression tests for failed inference, retry, transcript consistency, fallback response shape, and model fallback/name consistency.

**Exit criteria:** failed turns never lose or duplicate player answers, every service result can be rendered safely, and model status is truthful.

### Phase 2 — Make interviews relevant and player-led

- Select the opening question from current game context instead of always using the first recent-hire prompt. Candidate topics include a new hire, upcoming match or event, champion, finances, and recent results; use a sensible generic question when context is missing.
- Make interview length responsive: allow a strong answer to conclude early, use follow-ups to probe vague or contradictory answers, and let the player end the interview at any point.
- Clarify featured-wrestler and rival selection. Identify whether a selected rival is already an active rivalry, and tell the player when interview choices can create or increase rivalry heat.
- Preserve the existing pre-show interview opportunity while ensuring it does not force an unnecessarily long interaction immediately before an event.
- Add tests for context-based question selection, missing-context fallback, early finish, follow-up behavior, skip behavior, and story-focus effects.

**Exit criteria:** opening questions reflect available game state, and players can complete an interview on their terms without breaking event-day progression.

### Phase 3 — Improve answer evaluation and explain outcomes

- Replace brittle substring checks with a structured, transparent rubric. Evaluate relevance to the question, professionalism, hype, controversy, and answer clarity separately; preserve deterministic bounded scoring for gameplay consequences.
- Avoid rewarding verbosity or isolated keywords. Include tests for paraphrases, negation, short relevant answers, irrelevant long answers, and keyword stuffing.
- Show a concise post-interview debrief explaining which answer qualities affected fans, prestige, sponsor trust, alignment, and rivalry heat. Keep all changes bounded and consistent with existing consequence formulas.
- Treat model-generated text as presentation only: do not allow generated claims to set game-state outcomes or bypass deterministic validation.

**Exit criteria:** equivalent answers receive consistent scoring, edge cases do not gain rewards through keyword tricks, and the player can understand the resulting changes.

### Phase 4 — Accessibility, localization, and end-to-end coverage

- Give the interview modal dialog semantics, connect the answer label to its input, announce new journalist turns and errors accessibly, and verify keyboard-only completion.
- Move interview prompts, controls, model-status messages, error messages, and debrief text into localization keys before adding additional supported locales.
- Add component or flow-level tests for the complete interview lifecycle, including eligibility, focus selection, inference loading/failure, retry, completion, skip, and pre-show behavior.
- Add a short interview guide documenting eligibility, local model requirements, fallback behavior, scoring/effects, and known limitations; update it alongside future configuration changes.

**Exit criteria:** core actions are accessible by keyboard and assistive technology, user-facing strings are localizable, and the principal success and failure paths have automated coverage.

### Suggested delivery order

1. Ship Phase 1 before changing dialogue or scoring so that the existing interaction is safe to retry.
2. Ship Phase 2 to fix the fixed opening question and give players control over interview length.
3. Ship Phase 3 after rubric expectations and consequence bounds are covered by tests.
4. Complete Phase 4 alongside the preceding work where practical; do not defer basic accessibility or failure-state coverage until the end.
