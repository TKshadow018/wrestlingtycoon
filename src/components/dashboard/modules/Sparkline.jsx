import styles from './Sparkline.module.scss'

const toPoints = (values, width, height, padding) => {
  if (values.length === 0) return ''

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = maxValue - minValue || 1
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0

  return values
    .map((value, index) => {
      const x = padding + index * step
      const normalized = (value - minValue) / range
      const y = height - padding - normalized * (height - padding * 2)
      return `${x},${y}`
    })
    .join(' ')
}

function Sparkline({ values, label }) {
  const width = 240
  const height = 70
  const padding = 8
  const points = toPoints(values, width, height, padding)

  return (
    <article className={styles.sparklineCard}>
      <p>{label}</p>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <polyline points={points} />
      </svg>
    </article>
  )
}

export default Sparkline
