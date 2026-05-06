import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClientInstance } from "@/lib/query-client"
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from "react-router-dom"
import useUserRole from "@/lib/useUserRole"
import PageNotFound from "./lib/PageNotFound"
import { AuthProvider, useAuth } from "@/lib/AuthContext"
import UserNotRegisteredError from "@/components/UserNotRegisteredError"
import { AppProvider, useStore } from "@/lib/store"
import { ToastProvider } from "@/lib/toast"
import ToastContainer from "./components/ToastContainer"
import Layout from "./components/Layout"
import Dashboard from "./pages/Dashboard"
import Salon from "./pages/Salon"
import Reservas from "./pages/Reservas"
import Stock from "./pages/Stock"
import Conexion from "./pages/Conexion"
import Reportes from "./pages/Reportes"
import Analiticas from "./pages/Analiticas"
import Caja from "./pages/Caja"
import PublicReservation from "./pages/public/PublicReservation"
import Cocina from "./pages/public/Cocina"
import Configuracion from "./pages/Configuracion"
import CocinaDisplay from "./pages/CocinaDisplay"
import OnboardingFlow from "./pages/OnboardingFlow"
import Login from "./pages/Login"

const RoleGuard = ({ roles, children }) => {
  const role = useUserRole()
  const { loading } = useStore()
  if (loading || role === null) return null
  if (roles.includes(role)) return children
  return <Navigate to="/salon" replace />
}

const AuthenticatedApp = () => {
  const { isAuthenticated, isLoadingAuth } = useAuth()

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <LoadedApp />
}

const LoadedApp = () => {
  const { loading, isInvitedUser } = useStore()

  if (loading) return (
    <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", backgroundColor:"#F6F8FA" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:24, fontWeight:700, color:"#1D9E75", marginBottom:8 }}>mimenú</div>
        <div style={{ fontSize:14, color:"#9CA3AF" }}>Cargando tu restaurante...</div>
      </div>
    </div>
  )

  if (isInvitedUser) return (
    <div style={{ minHeight:"100vh", backgroundColor:"#F6F8FA", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ backgroundColor:"white", borderRadius:16, padding:40, maxWidth:420, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:20, fontWeight:700, color:"#111827", marginBottom:8 }}>Acceso pendiente</div>
        <div style={{ fontSize:14, color:"#6B7280", marginBottom:24 }}>El administrador aún no terminó de configurar tu acceso.</div>
        <button onClick={() => window.location.reload()}
          style={{ padding:"10px 24px", backgroundColor:"#1D9E75", color:"white", border:"none", borderRadius:8, fontSize:14, cursor:"pointer" }}>
          Reintentar
        </button>
      </div>
    </div>
  )

  return <RoutedApp />
}

const RoutedApp = () => {
  const role = useUserRole()
  const loc = useLocation()
  const { needsOnboarding } = useStore()
  if (needsOnboarding) return <OnboardingFlow />
  if (role === "Cocinero" && loc.pathname !== "/cocina") return <Navigate to="/cocina" replace />

  return (
    <Routes>
      <Route path="/public/reservas/:branchSlug" element={<PublicReservation />} />
      <Route path="/public/cocina" element={<Cocina />} />
      <Route path="/cocina" element={<CocinaDisplay />} />
      <Route element={<Layout />}>
        <Route path="/" element={<RoleGuard roles={["Dueno","Encargado"]}><Dashboard /></RoleGuard>} />
        <Route path="/salon" element={<Salon />} />
        <Route path="/caja" element={<RoleGuard roles={["Dueno","Encargado"]}><Caja /></RoleGuard>} />
        <Route path="/reservas" element={<Reservas />} />
        <Route path="/stock" element={<RoleGuard roles={["Dueno","Encargado"]}><Stock /></RoleGuard>} />
        <Route path="/conexion" element={<RoleGuard roles={["Dueno","Encargado"]}><Conexion /></RoleGuard>} />
        <Route path="/reportes" element={<RoleGuard roles={["Dueno","Encargado"]}><Reportes /></RoleGuard>} />
        <Route path="/analiticas" element={<RoleGuard roles={["Dueno","Encargado"]}><Analiticas /></RoleGuard>} />
        <Route path="/configuracion" element={<RoleGuard roles={["Dueno"]}><Configuracion /></RoleGuard>} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <ToastProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/public/reservas/:branchSlug" element={<PublicReservation />} />
                <Route path="/public/cocina" element={<Cocina />} />
                <Route path="*" element={<AuthenticatedApp />} />
              </Routes>
            </Router>
            <Toaster />
            <ToastContainer />
          </QueryClientProvider>
        </ToastProvider>
      </AppProvider>
    </AuthProvider>
  )
}

export default App
