# Wrestling Tycoon — Copilot Instructions

## Tech Stack
- React 19 + Vite 8
- Zustand 5 (with `persist` middleware) for all game state
- React Router v7
- SCSS Modules for component styles (one `.module.scss` per component)
- i18next / react-i18next for all user-facing strings
- Firebase (optional/cloud persistence)

## Project Conventions

### State Management (Zustand)
- All game state lives in `src/store/useGameStore.js`.
- **Never select object literals** directly from `useGameStore` in React components — select primitives or stable references to prevent render loops (Zustand v5 strict equality).
- Prefer individual selectors: `const money = useGameStore(s => s.money)` over `const { money } = useGameStore(...)`.
- Store actions are co-located at the bottom of `useGameStore.js`.

### Components
- One `.jsx` + one `.module.scss` per component. Do not share SCSS files across components.
- All text rendered to the user must use `useTranslation()` and a key in `src/i18n/locales/en.json`.
- Do not hardcode display strings.

### Styling
- SCSS Modules only — no inline styles, no global CSS classes in components.
- Theme variables are in `src/styles/theme.scss`; import via `@use`.

### Data Files
- Static people data lives in `src/data/people/` as JSON split by gender and role.
- Event templates in `src/data/eventTemplates.js`, title catalog in `src/data/titles.json`.

## Game Rules & Domain Knowledge
- **Match segments** carry a `matchRating` (1.0–10.0) based on wrestler skill, stamina, and a random factor.
- **Stamina**: wrestlers lose 20–50 stamina per match segment; regenerate +10 per day.
- **Interviews** force no winner and apply a popularity swing of ±3–10 to the wrestler.
- **Announcer** is required only for `mainEvent` and `interview` slots.
- `announcer` and `referee` roles are **excluded** from participant/opponent history in employee stats.
- Title holders are tracked via `holderEmployeeIds` (array); singles titles use index 0, doubles use two IDs.

## File Structure Hints
- Pages: `src/pages/`
- Dashboard modules (sub-panels): `src/components/dashboard/modules/`
- Shared/common components: `src/components/common/`
- Game config constants: `src/config/gameConfig.js`

## Do Not
- Do not bypass `normalizeTitleRecord` when creating or restoring title state.
- Do not add `console.log` statements in production paths.
- Do not add features or refactor code beyond what is explicitly requested.
