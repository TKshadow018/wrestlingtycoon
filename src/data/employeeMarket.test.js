import { describe, expect, it } from 'vitest'
import { createEmployeeCandidates, createModWrestlerCandidates } from './employeeMarket'

const modWrestler = (overrides = {}) => ({
  id: 'custom-ace',
  personId: 'custom-ace',
  name: 'Custom Ace',
  role: 'wrestler',
  gender: 'male',
  popularity: 86,
  salary_demand: { monthly_wage: 20000, per_match_salary: 3000, additional_bonus: 5000 },
  wrestling_ability: {
    strength: 60,
    technics: 92,
    high_fly_ability: 60,
    leg_stamina: 80,
    body_stamina: 80,
    head_stamina: 80,
  },
  ...overrides,
})

describe('wrestler archetype candidate data', () => {
  it('assigns built-in roster candidates an archetype based on their wrestling profile', () => {
    const candidate = createEmployeeCandidates()
      .find((entry) => entry.role === 'wrestler')

    expect(candidate.archetypeId).toBeTruthy()
  })

  it('creates custom wrestler candidates with their mod archetype and stable candidate id', () => {
    const candidate = createModWrestlerCandidates({
      rosterData: [modWrestler({ archetypeId: 'technical-custom' })],
      archetypes: [{
        archetypeId: 'technical-custom',
        name: 'Custom Technician',
        alignment: 'face',
        style: 'technical',
      }],
    })[0]

    expect(candidate).toMatchObject({
      candidateId: 'mod-candidate-custom-ace',
      archetypeId: 'technical-custom',
      skill: expect.any(Number),
      contract: { monthlySalary: 20000 },
    })
  })

  it('infers a supported archetype for custom wrestlers missing one and restores saved contract offers', () => {
    const candidate = createModWrestlerCandidates({
      rosterData: [modWrestler()],
      previousCandidates: [{
        id: 'custom-ace',
        salary: 18000,
        contract: { negotiatedMonthlySalary: 18000, negotiationAttempted: true },
      }],
    })[0]

    expect(candidate.archetypeId).toBe('technician')
    expect(candidate.salary).toBe(18000)
    expect(candidate.contract).toMatchObject({
      monthlySalary: 20000,
      negotiatedMonthlySalary: 18000,
      negotiationAttempted: true,
    })
  })

  it('ignores non-wrestler or unidentified package entries', () => {
    expect(createModWrestlerCandidates({
      rosterData: [
        modWrestler({ role: 'manager' }),
        modWrestler({ id: '', personId: '', role: 'wrestler' }),
      ],
    })).toEqual([])
  })
})
