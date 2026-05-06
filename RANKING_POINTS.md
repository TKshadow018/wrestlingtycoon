# Ranking Points System

This file documents how ranking points are calculated for wrestlers and teams.

## Wrestler Ranking

Source logic:
- src/utils/wrestlerRank.js
- Used by src/components/dashboard/modules/WrestlerRankModule.jsx

### 1. Initial points

Each wrestler starts with points from popularity:

- `initialPoints = round(popularity * 10)`

Example:
- Popularity 67 -> `670` starting points

### 2. Match set used for ranking

Only these segment types count:
- `match`
- `mainEvent`
- `titleMatch`

Ranking logic collects unique matches from wrestler match history and avoids double-counting duplicates.

### 3. Point changes per winner/loser pair

For each match:
- Build winner set and loser set from participants
- For every `(winner, loser)` pair, compute:

- `upsetFactor = (loserPoints - winnerPoints) * 0.04`
- `gain = clamp(6 + upsetFactor, 3, 24)`
- `loss = clamp(gain * 0.7, 2, 18)`

Then apply:
- Winner gains `+gain`
- Loser loses `-loss`

Important behavior:
- Beating stronger opponents gives larger gains.
- Losing to weaker opponents hurts more.
- Points cannot go below 0.

### 4. Wrestler ordering and rank

After all matches are applied:
- `rankPoints = round(currentPoints)`
- Sort by:
1. Higher `rankPoints`
2. Higher `popularity`
3. Name (A-Z)

Displayed rank is 1-based index after sorting:
- `rank = index + 1`

`rankDelta` is shown as movement from initial seed order to final order:
- `rankDelta = initialRank - currentRank`

## Team Ranking

Source logic:
- src/utils/wrestlerRank.js (`calculateTeamRanking`)
- Used by:
  - src/components/dashboard/modules/ManageEmployeesModule.jsx
  - src/components/dashboard/modules/WrestlerRankModule.jsx

### 1. Division views

Team ranking is computed separately for `male` and `female` views.

Inclusion rules:
- Male view includes teams with at least one male wrestler.
- Female view includes teams with at least one female wrestler.
- Mixed teams appear in both views.

### 2. Team points

For each team in the selected division:
- Get ranked wrestler points from that division (`rankPoints`).
- Use team members that match the selected division for scoring.
- If no members match the selected division, fallback to all team members.

Formula:
- `teamRankPoints = round(average(memberRankPoints))`

### 3. Team ordering and rank

Sort teams by:
1. Higher `teamRankPoints`
2. Team name (A-Z)

Then assign:
- `teamRank = index + 1`

## Notes

- Rankings update dynamically from current roster + match history.
- If no qualifying wrestlers/matches exist, ranking lists are empty.
- This system is independent from happiness changes, but rank position is used by bonus happiness formula elsewhere.
