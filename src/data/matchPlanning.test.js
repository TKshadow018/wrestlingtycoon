import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MATCH_LENGTH_MINUTES,
  MATCH_LENGTH_OPTIONS,
  MATCH_MOMENT_ACTIONS,
  MATCH_PROP_OPTIONS,
  buildDefaultPlannedMoments,
  clampMatchLengthMinutes,
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
