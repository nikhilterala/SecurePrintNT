import React, { createContext, useState, useContext, type ReactNode } from 'react';
import axios from 'axios';

interface AuthContextType {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwtToken'));

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://localhost:7192';

  const login = async (email: string, password: string) => {
    const response = await axios.post(`${API_BASE_URL}/api/auth/login`, { email, password });
    const newToken = response.data.jwtToken;
    setToken(newToken);
    localStorage.setItem('jwtToken', newToken);
  };

  const register = async (email: string, password: string) => {
    const response = await axios.post(`${API_BASE_URL}/api/auth/register`, { email, password });
    const newToken = response.data.jwtToken; // Assuming registration also returns a token
    setToken(newToken);
    localStorage.setItem('jwtToken', newToken);
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('jwtToken');
  };

  return (
    <AuthContext.Provider value={{ token, login, register, logout }}>
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
