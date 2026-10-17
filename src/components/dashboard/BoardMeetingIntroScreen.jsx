import { useEffect, useState } from 'react'
import { getBoardMeetingImageUrl } from '../../utils/boardMeetingVisuals'
import styles from './BoardMeetingIntroScreen.module.scss'

function BoardMeetingIntroScreen({ isJanuary, durationMs = 2600, onComplete }) {
  const [visible, setVisible] = useState(false)
  const imageUrl = getBoardMeetingImageUrl(isJanuary)
  const title = isJanuary ? 'Annual Board Meeting & Election' : 'Monthly Board Meeting'

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => onComplete?.(), Math.max(1500, Number(durationMs) || 2600))

    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [durationMs, onComplete])

  return (
    <div className={`${styles.overlay} ${visible ? styles.overlayVisible : ''}`} data-testid="board-meeting-intro">
      <div className={styles.posterLayer} aria-hidden="true">
        <img className={styles.poster} src={imageUrl} alt="" />
      </div>
      <div className={styles.vignette} aria-hidden="true" />
      <div className={styles.scanlines} aria-hidden="true" />
      <div className={styles.content}>
        <p className={styles.label}>Board of Directors</p>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.subline}>
          {isJanuary ? 'The annual leadership vote is on the agenda.' : 'The board is convening to review the promotion.'}
        </p>
      </div>
    </div>
  )
}

export default BoardMeetingIntroScreen
