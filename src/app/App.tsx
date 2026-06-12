import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { OnboardingPage } from '@/features/auth/OnboardingPage'
import { AppLayout } from '@/app/AppLayout'
import { RequireRole } from '@/app/RequireRole'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { CatalogPage } from '@/features/catalog/CatalogPage'
import { SalePage } from '@/features/sale/SalePage'
import { KitchenPage } from '@/features/kitchen/KitchenPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { CashCutPage } from '@/features/cashcut/CashCutPage'
import { PromosPage } from '@/features/promos/PromosPage'
import { TeamPage } from '@/features/team/TeamPage'
import { MorePage } from '@/app/MorePage'
import { SettingsPage } from '@/features/settings/SettingsPage'

// Pantalla de carga inicial mientras Supabase resuelve la sesión.
function Splash() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-accent" />
    </div>
  )
}

export function App() {
  const { loading, session, memberships, rol } = useAuth()

  if (loading) return <Splash />

  // Sin sesión: solo login.
  if (!session) return <LoginPage />

  // Con sesión pero sin negocio: onboarding.
  if (memberships.length === 0) return <OnboardingPage />

  // La cocina entra directo a su pantalla; no necesita el resto del POS.
  const inicio = rol === 'cocina' ? '/cocina' : '/'

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          index
          element={
            rol === 'cocina' ? <Navigate to="/cocina" replace /> : <DashboardPage />
          }
        />

        <Route
          path="venta"
          element={
            <RequireRole roles={['admin', 'cajero']}>
              <SalePage />
            </RequireRole>
          }
        />
        <Route
          path="catalogo"
          element={
            <RequireRole roles={['admin']}>
              <CatalogPage />
            </RequireRole>
          }
        />
        <Route
          path="cocina"
          element={
            <RequireRole roles={['admin', 'cocina']}>
              <KitchenPage />
            </RequireRole>
          }
        />
        <Route
          path="reportes"
          element={
            <RequireRole roles={['admin']}>
              <ReportsPage />
            </RequireRole>
          }
        />
        <Route
          path="caja"
          element={
            <RequireRole roles={['admin', 'cajero']}>
              <CashCutPage />
            </RequireRole>
          }
        />
        <Route
          path="equipo"
          element={
            <RequireRole roles={['admin']}>
              <TeamPage />
            </RequireRole>
          }
        />
        <Route
          path="promos"
          element={
            <RequireRole roles={['admin']}>
              <PromosPage />
            </RequireRole>
          }
        />
        <Route
          path="mas"
          element={
            <RequireRole roles={['admin']}>
              <MorePage />
            </RequireRole>
          }
        />
        <Route
          path="ajustes"
          element={
            <RequireRole roles={['admin']}>
              <SettingsPage />
            </RequireRole>
          }
        />
      </Route>

      {/* Cualquier otra ruta vuelve al inicio según el rol. */}
      <Route path="*" element={<Navigate to={inicio} replace />} />
    </Routes>
  )
}
