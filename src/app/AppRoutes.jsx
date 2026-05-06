import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardPage from '../pages/DashboardPage'
import StartScreenPage from '../pages/StartScreenPage'
import { useGameStore } from '../store/useGameStore'

function AppRoutes() {
  const hasStarted = useGameStore((state) => state.gameStatus.hasStarted)

  return (
    <Routes>
      <Route path="/" element={<StartScreenPage />} />
      <Route path="/dashboard" element={hasStarted ? <DashboardPage /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to={hasStarted ? '/dashboard' : '/'} replace />} />
    </Routes>
  )
}

export default AppRoutes
