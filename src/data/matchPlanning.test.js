import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MATCH_LENGTH_MINUTES,
  MATCH_LENGTH_OPTIONS,
  MATCH_MOMENT_ACTIONS,
  MATCH_PROP_OPTIONS,
  MATCH_PLAN_DIAGNOSTIC_CODES,
  MAX_PLANNED_MOMENTS,
  MATCH_DURATION_PRESETS,
  MATCH_FINISH_TYPES,
  MATCH_RISK_LEVELS,
  buildDefaultPlannedMoments,
  clampMatchLengthMinutes,
  normalizeMatchPlan,
  normalizePlannedMoments,
} from './matchPlanning'

describe('match planning', () => {
  it('supports match lengths from one minute through one hour', () => {
    expect(MATCH_LENGTH_OPTIONS[0]).toBe(1)
    expect(MATCH_LENGTH_OPTIONS.at(-1)).toBe(60)
    expect(MATCH_PROP_OPTIONS.map(({ id }) => id)).toEqual([
      'chair',
      'table',
      'ladder',
      'kendoStick',
      'steelSteps',
      'announceTable',
    ])
    expect(clampMatchLengthMinutes(0)).toBe(1)
    expect(clampMatchLengthMinutes(61)).toBe(60)
    expect(clampMatchLengthMinutes('15')).toBe(15)
    expect(clampMatchLengthMinutes('invalid')).toBe(DEFAULT_MATCH_LENGTH_MINUTES)
  })

  const moment = (overrides = {}) => ({
    momentId: 'opening', actionType: 'technicalExchange', actorId: 'a', targetId: 'b', atMinute: 1,
    ...overrides,
  })
  const input = (overrides = {}) => ({
    wrestlerIds: ['a', 'b'], matchLengthMinutes: 10, plannedMoments: [moment()],
    winnerEmployeeId: 'a', finishType: 'pin', riskLevel: 'balanced', ...overrides,
  })
  const codes = (diagnostics) => diagnostics.map(({ code }) => code)

  describe('central match plan schema', () => {
    it('exports UI-compatible constants and complete action metadata', () => {
      expect(MAX_PLANNED_MOMENTS).toBeGreaterThan(6)
      expect(MATCH_DURATION_PRESETS).toEqual([5, 10, 15, 20, 30, 45, 60])
      expect(MATCH_FINISH_TYPES).toEqual(['pin', 'submission', 'countout', 'dq'])
      expect(MATCH_RISK_LEVELS).toEqual(['balanced', 'risky', 'chaotic'])
      for (const action of MATCH_MOMENT_ACTIONS) {
        expect(action).toMatchObject({
          labelKey: expect.any(String), category: expect.any(String), targetRequired: expect.any(Boolean),
          propRequired: expect.any(Boolean), propAllowed: expect.any(Boolean),
          intensity: expect.any(Number), risk: expect.any(Number), pacingRole: expect.any(String),
        })
      }
      expect(MATCH_MOMENT_ACTIONS.find(({ id }) => id === 'usesProp').propRequired).toBe(true)
    })

    it('exports a unique diagnostic allowlist shared by all plan result channels', () => {
      expect(new Set(MATCH_PLAN_DIAGNOSTIC_CODES).size).toBe(MATCH_PLAN_DIAGNOSTIC_CODES.length)
      expect(MATCH_PLAN_DIAGNOSTIC_CODES).toEqual(expect.arrayContaining([
        'minuteAdjusted', 'momentIdReassigned', 'invalidProp', 'invalidActor', 'missingWinner',
      ]))
      expect(MATCH_PLAN_DIAGNOSTIC_CODES).not.toContain('unrecognizedCode')
      const results = [
        normalizeMatchPlan(),
        normalizeMatchPlan(input({ segmentType: 'promo' })),
        normalizeMatchPlan(input({
          matchLengthMinutes: 100, props: ['chair', 'invalid'], winnerEmployeeId: 'missing',
          finishType: 'invalid', riskLevel: 'invalid', winnerTeamIds: ['a'],
          plannedMoments: [
            moment({ momentId: '', atMinute: 100, actorId: 'missing', targetId: 'missing' }),
            moment({ momentId: '', actionType: 'usesProp', propId: 'table', targetId: null }),
            moment({ actionType: 'invalid' }),
          ],
        })),
      ]
      for (const result of results) {
        for (const { code } of [...result.errors, ...result.warnings, ...result.adjustments]) {
          expect(MATCH_PLAN_DIAGNOSTIC_CODES).toContain(code)
        }
      }
    })

    it('normalizes valid plans without blocking errors and accepts legacy moments', () => {
      const result = normalizeMatchPlan(input({ plannedMoments: undefined, moments: [moment()] }))
      expect(result.errors).toEqual([])
      expect(result.plan).toMatchObject({
        matchLengthMinutes: 10, props: [], winnerEmployeeId: 'a', winnerTeamIds: [],
        finishType: 'pin', riskLevel: 'balanced', plannedMoments: [expect.objectContaining({ momentId: 'opening' })],
      })
      expect(normalizeMatchPlan({ ...input(), ...result.plan }).plan).toEqual(result.plan)
    })

    it('clamps duration and minutes, sorts stably and reports adjustments', () => {
      const result = normalizeMatchPlan(input({
        matchLengthMinutes: 75.4,
        plannedMoments: [moment({ momentId: 'late', atMinute: 99 }), moment({ momentId: 'early', atMinute: -1 }), moment({ momentId: 'tie', atMinute: 1 })],
      }))
      expect(result.plan.matchLengthMinutes).toBe(60)
      expect(result.plan.plannedMoments.map(({ momentId }) => momentId)).toEqual(['early', 'tie', 'late'])
      expect(codes(result.adjustments)).toEqual(expect.arrayContaining(['invalidDuration', 'minuteAdjusted']))
      expect(normalizeMatchPlan(input({ matchLengthMinutes: NaN })).plan.matchLengthMinutes).toBe(10)
    })

    it('assigns deterministic unique IDs without stealing existing IDs', () => {
      const data = input({ plannedMoments: [
        moment({ momentId: '' }), moment({ momentId: 'moment-1' }),
        moment({ momentId: 'moment-1' }), moment({ momentId: '  kept  ' }),
      ] })
      const first = normalizeMatchPlan(data)
      expect(first).toEqual(normalizeMatchPlan(data))
      const ids = first.plan.plannedMoments.map(({ momentId }) => momentId)
      expect(new Set(ids).size).toBe(4)
      expect(ids[1]).toBe('moment-1')
      expect(ids[3]).toBe('kept')
      expect(codes(first.adjustments)).toContain('momentIdReassigned')
    })

    it('bounds both strict and legacy normalization', () => {
      const moments = Array.from({ length: MAX_PLANNED_MOMENTS + 50 }, () => moment())
      const result = normalizeMatchPlan(input({ plannedMoments: moments }))
      expect(result.plan.plannedMoments).toHaveLength(MAX_PLANNED_MOMENTS)
      expect(codes(result.warnings)).toContain('momentsTruncated')
      const legacy = normalizePlannedMoments({ wrestlerIds: ['a', 'b'], moments })
      expect(legacy.plannedMoments).toHaveLength(MAX_PLANNED_MOMENTS)
      expect(new Set(legacy.plannedMoments.map(({ momentId }) => momentId)).size).toBe(MAX_PLANNED_MOMENTS)
    })

    it('reports invalid references while preserving compatible legacy repairs', () => {
      const result = normalizeMatchPlan(input({
        props: ['chair', 'fake', 'chair'],
        plannedMoments: [
          moment({ momentId: 'badActor', actorId: 'missing' }),
          moment({ momentId: 'badTarget', targetId: 'a' }),
          moment({ momentId: 'badAction', actionType: 'fake' }),
          moment({ momentId: 'badProp', actionType: 'usesProp', propId: 'table' }),
        ],
        winnerEmployeeId: 'missing', finishType: 'fake', riskLevel: 'fake',
      }))
      expect(codes(result.errors)).toEqual(expect.arrayContaining([
        'invalidActor', 'invalidTarget', 'targetRequired', 'invalidAction', 'invalidProp',
        'propRequired', 'invalidWinner', 'invalidFinishType', 'invalidRiskLevel',
      ]))
      expect(result.plan.props).toEqual(['chair'])
      expect(result.plan.plannedMoments).toHaveLength(3)
      expect(result.plan.plannedMoments[0].targetId).toBeNull()
      expect(result.plan.winnerEmployeeId).toBeNull()
      expect(result.plan.finishType).toBe('pin')
      expect(result.plan.riskLevel).toBe('balanced')
      expect(codes(result.adjustments)).toContain('invalidProps')
      result.errors.forEach((entry) => expect(Object.keys(entry).every((key) => ['code', 'momentId'].includes(key))).toBe(true))
    })

    it('requires targets and selected props only according to action metadata', () => {
      expect(codes(normalizeMatchPlan(input({ plannedMoments: [moment({ targetId: null })] })).errors)).toContain('targetRequired')
      const valid = normalizeMatchPlan(input({
        props: ['chair'], plannedMoments: [moment({ actionType: 'usesProp', propId: 'chair' })],
      }))
      expect(valid.errors).toEqual([])
      const stripped = normalizeMatchPlan(input({ props: ['chair'], plannedMoments: [moment({ propId: 'chair' })] }))
      expect(stripped.plan.plannedMoments[0].propId).toBeNull()
      expect(codes(stripped.adjustments)).toContain('invalidProp')
      expect(normalizeMatchPlan(input({ plannedMoments: [moment({ actionType: 'refereeDistraction', targetId: null })] })).errors).toEqual([])
    })

    it('validates complete eligible tag teams without preferring a winner', () => {
      const tag = input({
        matchType: 'tagTeam', wrestlerIds: ['a', 'b', 'c', 'd'], team1Ids: ['a', 'c'], team2Ids: ['b', 'd'],
        winnerEmployeeId: null, winnerTeamIds: ['c', 'a'],
      })
      expect(normalizeMatchPlan(tag).errors).toEqual([])
      expect(normalizeMatchPlan(tag).plan.winnerTeamIds).toEqual(['c', 'a'])
      const normalized = normalizeMatchPlan(tag).plan
      expect(normalizeMatchPlan({ wrestlerIds: tag.wrestlerIds, ...normalized }).errors).toEqual([])
      for (const winnerTeamIds of [['a'], ['a', 'd'], ['a', 'missing'], ['a', 'a', 'c']]) {
        expect(codes(normalizeMatchPlan({ ...tag, winnerTeamIds }).errors)).toContain('invalidWinnerTeam')
      }
      expect(codes(normalizeMatchPlan(input({ winnerTeamIds: ['a', 'b'] })).errors)).toContain('invalidWinnerTeam')
      expect(codes(normalizeMatchPlan({ ...tag, winnerEmployeeId: 'b' }).errors)).toContain('invalidWinner')
      expect(codes(normalizeMatchPlan({ ...tag, team2Ids: ['a', 'b'] }).errors)).toContain('invalidWinnerTeam')
      expect(codes(normalizeMatchPlan({ ...tag, winnerTeamIds: {} }).errors)).toContain('invalidWinnerTeam')
    })

    it('clears all match-only data on non-match segments', () => {
      expect(normalizeMatchPlan(input({ segmentType: 'promo', props: ['chair'] }))).toMatchObject({
        plan: { matchLengthMinutes: null, props: [], plannedMoments: [], winnerEmployeeId: null, winnerTeamIds: [], finishType: null, riskLevel: null },
        errors: [], adjustments: [{ code: 'nonMatchDataCleared' }],
      })
      for (const segmentType of ['match', 'mainEvent', 'titleMatch']) {
        expect(normalizeMatchPlan(input({ segmentType })).plan.matchLengthMinutes).toBe(10)
      }
    })

    it('handles empty, malformed and hostile primitive fields without throwing', () => {
      for (const data of [undefined, null, [], 1, {}, { props: {}, plannedMoments: {}, wrestlerIds: null }, input({
        matchLengthMinutes: Symbol('invalid'), plannedMoments: [null, false, {}, moment({ atMinute: Symbol('invalid') })],
      })]) {
        const result = normalizeMatchPlan(data)
        expect(result.plan.matchLengthMinutes).toBeGreaterThanOrEqual(1)
        expect(result.plan.matchLengthMinutes).toBeLessThanOrEqual(60)
        expect(Array.isArray(result.errors)).toBe(true)
      }
      expect(codes(normalizeMatchPlan().warnings)).toContain('emptyPlan')
      expect(buildDefaultPlannedMoments({ wrestlerIds: ['a'] })).toEqual([])
    })
  })

  it('builds a usable default plan from the wrestlers in a segment', () => {
    const moments = buildDefaultPlannedMoments({
      wrestlerIds: ['wrestler-a', 'wrestler-b'],
      matchLengthMinutes: 30,
    })

    expect(moments.length).toBeGreaterThan(1)
    expect(moments[0]).toMatchObject({
      actionType: MATCH_MOMENT_ACTIONS[0].id,
      actorId: 'wrestler-a',
      targetId: 'wrestler-b',
    })
    expect(moments.every((moment) => moment.momentId)).toBe(true)
  })

  it('keeps multiple selected props and removes invalid moment references', () => {
    const normalized = normalizePlannedMoments({
      moments: [
        {
          momentId: 'moment-1',
          actionType: 'dominateStrikes',
          actorId: 'wrestler-a',
          targetId: 'wrestler-b',
        },
        {
          momentId: 'moment-2',
          actionType: 'usesProp',
          actorId: 'wrestler-a',
          targetId: 'missing',
          propId: 'chair',
        },
      ],
      wrestlerIds: ['wrestler-a', 'wrestler-b'],
      props: ['chair', 'table', 'not-a-prop'],
    })

    expect(normalized.props).toEqual(['chair', 'table'])
    expect(normalized.plannedMoments).toEqual([
      expect.objectContaining({
        momentId: 'moment-1',
        actorId: 'wrestler-a',
        targetId: 'wrestler-b',
      }),
      expect.objectContaining({
        momentId: 'moment-2',
        actionType: 'usesProp',
        actorId: 'wrestler-a',
        targetId: null,
        propId: 'chair',
      }),
    ])
  })
})
