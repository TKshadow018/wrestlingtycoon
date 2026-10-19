# AI Media Interviews

## Overview

Media interviews are optional dashboard activities powered by OpenRouter dialogue. Interview text is generated through the configured OpenRouter API; answer evaluation and game effects are deterministic JavaScript and do not depend on model claims.

## Eligibility and opening question

An interview can be offered when AI is enabled and ready, on a non-event day, outside a board meeting, event preparation, and other blocking dashboard flows. The offer is a daily random chance, except an interview is offered on the day before a PPV or Mega Live when eligible.

The opening question is selected from currently available game context: recent match results, an upcoming event, a held championship, a recent wrestler hire, or finances. The selector chooses among available topics; if none has context, it asks a general promotion question. A selected featured wrestler (and optional rival) overrides the company topic with a story question.

## OpenRouter setup and fallback

The interview uses the OpenRouter-compatible chat completions endpoint with the free-model router by default (`openrouter/free`). Set `VITE_OPENROUTER_API_KEY` in the environment before building or running the app. Set `VITE_OPENROUTER_MODEL` to use another OpenRouter model. The active model is shown during onboarding setup, with a retry action if the connection cannot be initialized.

Interview dialogue requests, including the current transcript and player answer, are sent to OpenRouter for generation. The game does not send answers to its Firebase backend for evaluation, and all gameplay scoring remains local deterministic JavaScript. Because `VITE_*` variables are embedded in a browser build, use a restricted OpenRouter key with appropriate usage limits. Inference failures do not count as completed answers: the transcript, rubric totals, and game state remain unchanged, and the player can retry or finish with previously accepted answers.

## Answer evaluation and dialogue

Each answer is scored deterministically against the current question. The rubric considers overlap between meaningful question/answer terms, answer clarity, professionalism, hype/confidence, and clearly expressed controversy or hostility. Negated signals are excluded where the text rules can identify them. Answers are not rewarded just for being long, and the model's `accept`/`counter` decision never changes the score or follow-up policy.

A vague, hostile, very short, question-irrelevant, or explicitly self-contradictory answer can prompt a journalist follow-up when the interview still has probes available. Contradiction detection is conservative and lexical: it compares opposing claims that share at least two meaningful terms, and treats explicit correction phrases as clarification. The normal maximum is three probes; a forced pre-show interview uses at most one. A failed required follow-up is retryable and does not commit that answer. Since this rubric is lexical and deterministic rather than a semantic language model, indirect paraphrases may not always be recognized as relevant.

## Finishing, skipping, and effects

- **Send Answer:** commits the answer, score, and generated journalist response together only after successful evaluation.
- **Finish Interview Now:** ends immediately and applies accumulated effects once if at least one answer was accepted. Ending before any answer has no game effect.
- **Skip Interview and Continue Day:** abandons the interview with no effects and proceeds with the day. It is distinct from finishing early.
- **Finish Interview and Continue Day:** closes a completed interview and proceeds. Effects have already been applied once when the final answer was committed.

Accumulated answers affect fans, prestige, sponsor trust, and—when selected—wrestler alignment and rivalry heat. Pre-show results use the existing 1.35 multiplier for fan and prestige changes. The final debrief shows both game deltas and accumulated rubric qualities. Selecting a wrestler as a rival can change an existing rivalry or start a new one if the interview raises its heat above zero; selecting no rival prevents a pair heat change. Story effects remain bounded by the game rules.

## Accessibility and localization

The interview and focus selectors are named modal dialogs. The answer has a visible label, the transcript is a polite live log, turn failures use an alert, and keyboard focus stays within each dialog. Interview controls, opening questions, story descriptions, fallback replies, and debrief labels are localization resources in `src/i18n/locales/en.json`. English is currently the only locale supplied; AI-generated dialogue and the deterministic word-overlap rubric are English-oriented, so adding another locale also requires language-aware evaluation and model instructions.

## Key implementation and tests

- Context selection, evaluation, and atomic turn proposal: `src/ai/interviewService.js`
- OpenRouter client, model selection, and recovery: `src/ai/openRouterManager.js` and `src/config/ai.js`
- Dashboard flow and consequence application: `src/pages/DashboardPage.jsx`, `src/store/useGameStore.js`
- Shared impact and story-effect calculations: `src/utils/interviewStoryEffects.js`
- Service, modal, focus, and store coverage: `src/ai/interviewService.test.js`, `src/components/dashboard/AiInterviewModal.test.jsx`, `src/components/dashboard/InterviewFocusModal.test.jsx`, `src/store/gameStoreActions.test.js`, `src/utils/interviewStoryEffects.test.js`
