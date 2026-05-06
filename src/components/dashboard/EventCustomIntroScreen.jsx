import { useEffect, useState } from 'react'
import styles from './EventCustomIntroScreen.module.scss'

function EventCustomIntroScreen({ event, durationMs = 2600, onComplete }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => {
      onComplete?.()
    }, Math.max(1500, Number(durationMs) || 2600))

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [durationMs, onComplete])

  if (!event) {
    return null
  }

  return (
    <div className={`${styles.overlay} ${visible ? styles.overlayVisible : ''}`}>
      <div className={styles.posterLayer} aria-hidden="true">
        <img className={styles.poster} src={event.imageUrl} alt="" />
      </div>
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.scanlines} aria-hidden="true" />
      <div className={styles.content}>
        <p className={styles.label}>Tonight's Special Event</p>
        <h2 className={styles.name}>{event.name}</h2>
        <p className={styles.subline}>Get ready for a major custom event night.</p>
      </div>
    </div>
  )
}

export default EventCustomIntroScreen
