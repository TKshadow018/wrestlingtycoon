import { describe, expect, it } from 'vitest'
import { BOARD_MEMBERS, BOARD_CHAIR, BOARD_VICE_CHAIR } from '../data/board'
import { getBoardEventAttendance } from './boardEventAttendance'

describe('board attendance event gate bonuses', () => {
  it('gives PPVs a 25% chance for one random board member to attend', () => {
    const absent = getBoardEventAttendance({
      eventType: 'ppv',
      boardMembers: BOARD_MEMBERS,
      baseGateRevenue: 100000,
      random: () => 0.25,
    })
    const attending = getBoardEventAttendance({
      eventType: 'ppv',
      boardMembers: BOARD_MEMBERS,
      baseGateRevenue: 100000,
      random: (() => {
        const values = [0.1, 0.6, 0]
        return () => values.shift()
      })(),
    })

    expect(absent).toBeNull()
    expect(attending.personName).toBe(BOARD_MEMBERS[4].person_name)
    expect(attending.gateBonusPercent).toBe(5)
    expect(attending.gateBonusAmount).toBe(5000)
  })

  it('uses the current president with a gate bonus between 20% and 25% at Mega Live', () => {
    const attendance = getBoardEventAttendance({
      eventType: 'megaLive',
      boardMembers: BOARD_MEMBERS,
      boardPresidentName: BOARD_MEMBERS[4].person_name,
      boardVicePresidentName: BOARD_VICE_CHAIR.person_name,
      baseGateRevenue: 100000,
      random: (() => {
        const values = [0.1, 0.999]
        return () => values.shift()
      })(),
    })

    expect(attendance.personName).toBe(BOARD_MEMBERS[4].person_name)
    expect(attendance.role).toBe('Board President')
    expect(attendance.gateBonusPercent).toBe(25)
    expect(attendance.gateBonusAmount).toBe(25000)
  })

  it('uses the current vice president with a gate bonus between 15% and 20% at Mega Live', () => {
    const attendance = getBoardEventAttendance({
      eventType: 'megaLive',
      boardMembers: BOARD_MEMBERS,
      boardPresidentName: BOARD_CHAIR.person_name,
      boardVicePresidentName: BOARD_MEMBERS[5].person_name,
      baseGateRevenue: 100000,
      random: (() => {
        const values = [0.9, 0]
        return () => values.shift()
      })(),
    })

    expect(attendance.personName).toBe(BOARD_MEMBERS[5].person_name)
    expect(attendance.role).toBe('Vice President')
    expect(attendance.gateBonusPercent).toBe(15)
    expect(attendance.gateBonusAmount).toBe(15000)
  })

  it('does not add board attendance to non-PPV events', () => {
    expect(getBoardEventAttendance({
      eventType: 'regularWeekly',
      boardMembers: BOARD_MEMBERS,
      baseGateRevenue: 100000,
      random: () => {
        throw new Error('No randomness expected for a regular event')
      },
    })).toBeNull()
  })
})
