export const DEFAULT_WRESTLER_ARCHETYPES = [
  {
    archetypeId: 'technician',
    name: 'The Technician',
    description: 'A precise grappler who wins through skill and counters.',
    alignment: 'face',
    style: 'technical',
  },
  {
    archetypeId: 'powerhouse',
    name: 'The Powerhouse',
    description: 'A dominant force who overwhelms opponents with strength.',
    alignment: 'heel',
    style: 'powerhouse',
  },
  {
    archetypeId: 'high-flyer',
    name: 'The High-Flyer',
    description: 'An aerial specialist who takes risks to thrill the crowd.',
    alignment: 'face',
    style: 'highFlyer',
  },
  {
    archetypeId: 'showstopper',
    name: 'The Showstopper',
    description: 'A charismatic personality who turns every appearance into a spectacle.',
    alignment: 'tweener',
    style: 'showman',
  },
]

const ARCHETYPE_IDS = new Set(DEFAULT_WRESTLER_ARCHETYPES.map((archetype) => archetype.archetypeId))

export const inferWrestlerArchetypeId = (person = {}) => {
  if (ARCHETYPE_IDS.has(person.archetypeId)) {
    return person.archetypeId
  }

  const ability = person.wrestling_ability || {}
  const strength = Number(ability.strength) || 0
  const technical = Number(ability.technics) || 0
  const aerial = Number(ability.high_fly_ability) || 0
  const maxSkill = Math.max(strength, technical, aerial)

  if (technical === maxSkill && technical >= 70) {
    return 'technician'
  }
  if (aerial === maxSkill && aerial >= 70) {
    return 'high-flyer'
  }
  if (strength >= 70) {
    return 'powerhouse'
  }
  return 'showstopper'
}

export const normalizeWrestlerArchetypes = (archetypes = []) => {
  const byId = new Map(DEFAULT_WRESTLER_ARCHETYPES.map((item) => [item.archetypeId, item]))
  ;(Array.isArray(archetypes) ? archetypes : []).forEach((archetype) => {
    if (archetype?.archetypeId && archetype?.name) {
      byId.set(archetype.archetypeId, {
        archetypeId: archetype.archetypeId,
        name: archetype.name,
        description: archetype.description || '',
        alignment: archetype.alignment || 'neutral',
        style: archetype.style || 'showman',
      })
    }
  })

  return [...byId.values()]
}
