# Home Country

## What it represents

The **Management Base Country** selector on the new-game screen sets the country recorded on the management profile. The dashboard presents that value as **Home Country**. It is profile information, not a selection of the promotion's operating territory.

## How it is chosen and stored

- The start screen defaults to **United States** and offers United States, Canada, United Kingdom, Japan, India, Mexico, Brazil, Germany, Australia, and France.
- When a game starts, the selected country is passed to `startGame`. The store asks `faker-user` to generate a representative aged 38–68 in that country, then stores only the generated person's country as `profile.homeCountry`. The generated person's name and other details do not replace the player-entered general manager identity.
- If profile generation fails or returns no country, the store uses United States. The normal start-screen flow supplies a country; if `startGame` is called directly without one, the generator is not country-restricted and may choose a country at random.
- The profile value is persisted with the game and included in exported save snapshots. When loading a save that has no home-country value, the store fills in United States.

## Current gameplay impact

**There is no country-specific gameplay modifier in the current implementation.** The stored value is used to display the country in the dashboard HUD and to preserve it in saves. No gameplay system reads `profile.homeCountry` to change starting cash, fans, morale, prestige, hiring, roster availability, venues, event results, competitors, or progression. Selecting a different country therefore changes the displayed management-profile country, but not the promotion's current simulation rules or starting advantages.

## Source of truth

- Onboarding country options and default: [StartScreenPage.jsx](../src/pages/StartScreenPage.jsx)
- Country selector field: [StartGameForm.jsx](../src/components/onboarding/StartGameForm.jsx)
- Profile generation, save persistence, and legacy-save fallback: [useGameStore.js](../src/store/useGameStore.js)
- Dashboard snapshot and HUD display: [DashboardPage.jsx](../src/pages/DashboardPage.jsx), [HudBar.jsx](../src/components/dashboard/HudBar.jsx)
- English label and country names: [en.json](../src/i18n/locales/en.json)