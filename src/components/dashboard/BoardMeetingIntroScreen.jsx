import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getBoardMeetingImageUrl } from '../../utils/boardMeetingVisuals'
import styles from './BoardMeetingIntroScreen.module.scss'

function BoardMeetingIntroScreen({ isJanuary, durationMs = 2600, onComplete }) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const imageUrl = getBoardMeetingImageUrl(isJanuary)

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
        <p className={styles.label}>{t('dashboard.boardMeeting.intro.department')}</p>
        <h2 className={styles.title}>
          {t(isJanuary ? 'dashboard.boardMeeting.intro.annualTitle' : 'dashboard.boardMeeting.intro.monthlyTitle')}
        </h2>
        <p className={styles.subline}>
          {t(isJanuary ? 'dashboard.boardMeeting.intro.annualDescription' : 'dashboard.boardMeeting.intro.monthlyDescription')}
        </p>
      </div>
    </div>
  )
}

export default BoardMeetingIntroScreen
