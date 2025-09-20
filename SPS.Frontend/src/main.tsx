import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import './index.css'
import LoginPage from './pages/LoginPage.tsx'
import RegisterPage from './pages/RegisterPage.tsx'
import DashboardPage from './pages/DashboardPage.tsx'
import PrintAccessPage from './pages/PrintAccessPage.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import PrivateRoute from './components/PrivateRoute.tsx'
import App from './App.tsx' // Moved App import here for clarity

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route 
            path="/dashboard" 
            element={
              <PrivateRoute>
                <DashboardPage />
              </PrivateRoute>
            }
          />
          <Route path="/print/:token" element={<PrintAccessPage />} />
          <Route path="/print" element={<PrintAccessPage />} /> {/* New route for direct access without token */}
          <Route path="/" element={<App />} />
        </Routes>
      </AuthProvider>
    </Router>
  </React.StrictMode>,
)
