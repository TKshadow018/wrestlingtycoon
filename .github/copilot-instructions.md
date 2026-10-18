# Testing Workflow
- For every implementation request, identify the relevant tests and create or update them to express the requested behavior before changing the implementation. Run those tests first when practical and confirm they fail for the expected reason.
- After implementation, review the relevant test files, update them to match the final behavior, and run the focused tests. Report the results and any checks that could not be run.
- In this repository, use `npm test` for the test suite and `npm run test:coverage` to check configured per-file JavaScript coverage thresholds.
- For core functionality, ensure that the essential tests are always up-to-date and passing before making any changes to the implementation.
- Create MD files for new features or significant changes to document their usage and behavior. also update existing documentation as needed.
- Ensure that any changes to environment variables or configuration files are reflected in the documentation.

# Localization Requirements
- Never hardcode user-facing text in application code. Add copy to `src/i18n/locales/*.json` and render it through `react-i18next` translation keys.
- This applies to all visible and assistive copy, including headings, buttons, labels, placeholders, validation/errors, empty states, tooltips, titles, alt text, and ARIA labels, as well as generated UI messages and fallback text.
- Keep persisted/game-state values language-neutral (stable IDs or translation keys) and translate them only when displayed; do not store English display labels as application data.
- Hardcoded strings are acceptable only for non-display technical values (such as IDs, enum keys, CSS classes, URLs, and test fixtures), not as fallbacks for missing translations.