import { useEffect, useRef, useState } from 'react'
import styles from './MegaEventVideoScreen.module.scss'

const VIDEO_DURATION_MS = 8500

function MegaEventVideoScreen({ event, onComplete }) {
  const videoRef = useRef(null)
  const timerRef = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))

    timerRef.current = setTimeout(() => {
      onComplete?.()
    }, VIDEO_DURATION_MS)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timerRef.current)
    }
  }, [onComplete])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.play().catch(() => {
      // autoplay blocked — still rely on the timer
    })
  }, [])

  if (!event) return null

  const videoSrc = '/Events/Chud%20ling%20pong.mp4'

  return (
    <div className={`${styles.overlay} ${visible ? styles.overlayVisible : ''}`}>
      <video
        ref={videoRef}
        className={styles.video}
        src={videoSrc}
        autoPlay
        muted={false}
        playsInline
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback"
      />
    </div>
  )
}

export default MegaEventVideoScreen
