const randomInRange = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const BASE_EVENT_TEMPLATES = [
  { eventId: 'tv-night', name: 'Television Night', productionScale: 2, popularityWeight: 1.1, setupCost: 9000 },
  { eventId: 'arena-show', name: 'Arena Showcase', productionScale: 3, popularityWeight: 1.28, setupCost: 15000 },
  { eventId: 'ppv', name: 'Pay-Per-View Maincard', productionScale: 4, popularityWeight: 1.45, setupCost: 24000 },
  { eventId: 'street-fight', name: 'Street Fight Special', productionScale: 3, popularityWeight: 1.36, setupCost: 19000 },
  { eventId: 'championship', name: 'Championship Spotlight', productionScale: 4, popularityWeight: 1.62, setupCost: 30000 },
]

export const createEventTemplates = () => {
  return BASE_EVENT_TEMPLATES.map((template) => {
    const hype = randomInRange(55, 96)
    const risk = randomInRange(8, 38)

    return {
      ...template,
      hype,
      risk,
      templateKey: `${template.eventId}-${Date.now()}-${randomInRange(100, 999)}`,
    }
  })
}
