import React, { createContext, useState, useContext, useEffect, useRef, type ReactNode } from 'react'; // Added useEffect, useRef
import axios from 'axios';
import { useNavigate } from 'react-router-dom'; // Import useNavigate

interface AuthContextType {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  showSessionModal: boolean; // Added for session modal
  sessionCountdown: number; // Added for session modal countdown
  extendSession: () => Promise<void>; // Added for session extension
  setShowSessionModal: (show: boolean) => void; // Added to allow external components to close modal if needed
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://localhost:7192';

// Helper function to decode JWT token
const decodeJwt = (jwtToken: string) => {
  try {
    const parts = jwtToken.split('.');
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch (e) {
    console.error('Failed to decode JWT:', e);
    return null;
  }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwtToken'));
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionCountdown, setSessionCountdown] = useState(0);
  const sessionTimerRef = useRef<any>(null); // To store setTimeout/setInterval IDs
  const countdownIntervalRef = useRef<any>(null); // To store countdown interval ID
  const navigate = useNavigate(); // Initialize useNavigate

  const clearSessionTimers = () => {
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  const setupSessionTimer = (jwtToken: string | null) => {
    clearSessionTimers(); // Clear any existing timers

    if (!jwtToken) {
      return;
    }

    const decodedToken = decodeJwt(jwtToken);
    if (!decodedToken || !decodedToken.exp) {
      console.error('JWT token has no expiration time (exp claim).');
      return;
    }

    const expiryTime = decodedToken.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    const timeUntilExpiry = expiryTime - currentTime;

    // Trigger warning 5 minutes before expiry
    const warningTime = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (timeUntilExpiry > warningTime) {
      // Set a timer to show the modal
      sessionTimerRef.current = setTimeout(() => {
        setShowSessionModal(true);
        setSessionCountdown(30); // Start 30-second countdown
        countdownIntervalRef.current = setInterval(() => {
          setSessionCountdown(prev => {
            if (prev <= 1) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
              logout(); // Auto-logout if countdown reaches 0
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }, timeUntilExpiry - warningTime);
    } else if (timeUntilExpiry > 0 && timeUntilExpiry <= warningTime) {
      // If already within the warning window, show modal immediately
      setShowSessionModal(true);
      setSessionCountdown(Math.max(0, Math.floor(timeUntilExpiry / 1000))); // Set countdown to remaining time or 0
      countdownIntervalRef.current = setInterval(() => {
        setSessionCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
            logout(); // Auto-logout if countdown reaches 0
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Token is already expired
      logout();
    }
  };

  const refreshToken = async (expiredToken: string) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/refresh-token`, { expiredToken });
      const newToken = response.data.newJwtToken;
      // const newExpiry = response.data.expiry; // Backend now returns expiry, but not directly used here.

      setToken(newToken);
      localStorage.setItem('jwtToken', newToken);
      clearSessionTimers(); // Clear old timers
      setupSessionTimer(newToken); // Setup new timer with new token
      return true;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      logout(); // Force logout on refresh failure
      return false;
    }
  };

  const extendSession = async () => {
    if (token) {
      const success = await refreshToken(token);
      if (success) {
        setShowSessionModal(false); // Hide modal on success
      }
    } else {
      logout(); // If no token, just logout
    }
  };

  const login = async (email: string, password: string) => {
    const response = await axios.post(`${API_BASE_URL}/api/auth/login`, { email, password });
    const newToken = response.data.jwtToken;
    setToken(newToken);
    localStorage.setItem('jwtToken', newToken);
    setupSessionTimer(newToken); // Setup timer after login
  };

  const register = async (email: string, password: string) => {
    const response = await axios.post(`${API_BASE_URL}/api/auth/register`, { email, password });
    const newToken = response.data.jwtToken; // Assuming registration also returns a token
    setToken(newToken);
    localStorage.setItem('jwtToken', newToken);
    setupSessionTimer(newToken); // Setup timer after registration
  };

  const logout = () => {
    clearSessionTimers(); // Clear all timers on logout
    setToken(null);
    localStorage.removeItem('jwtToken');
    setShowSessionModal(false); // Ensure modal is hidden
    navigate('/'); // Redirect to home page on logout
  };

  // Effect to set up or clear timers when token changes
  useEffect(() => {
    setupSessionTimer(token);
    // Cleanup on component unmount
    return () => clearSessionTimers();
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, login, register, logout, showSessionModal, sessionCountdown, extendSession, setShowSessionModal }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
