export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export const average = (values) => (
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0
)

export const createStableKey = (values = [], separator = '::') => (
  [...values].sort().join(separator)
)

export const formatNumber = (value, locale) => Number(value).toLocaleString(locale)

export const randomInRange = (min, max, modifiers = []) => {
  const items = [];

  for (let value = min; value <= max; value++) {
    let weight = 1;

    for (const mod of modifiers) {
      const inRange = value >= mod.min && value <= mod.max;

      if (!inRange) continue;

      switch (mod.type) {
        case "multiplyWeight":
          weight *= mod.by;
          break;

        case "exclude":
          weight = 0;
          break;

        case "setWeight":
          weight = mod.weight;
          break;

        default:
          throw new Error(`Unknown modifier: ${mod.type}`);
      }
    }

    if (weight > 0) {
      items.push({ value, weight });
    }
  }

  const totalWeight = items.reduce(
    (sum, item) => sum + item.weight,
    0
  );

  let random = Math.random() * totalWeight;

  for (const item of items) {
    random -= item.weight;

    if (random <= 0) {
      return item.value;
    }
  }
}