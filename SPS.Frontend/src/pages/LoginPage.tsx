import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom'; // Import Link for homepage navigation

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const [showLoginErrorModal, setShowLoginErrorModal] = useState(false); // New state for login error modal
  const [loginErrorMessage, setLoginErrorMessage] = useState(''); // New state for login error message

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/dashboard'); // Redirect to dashboard on successful login
    } catch (error) {
      // console.error('Login failed:', error); // Removed console.error
      setLoginErrorMessage('Login failed. Please check your credentials.');
      setShowLoginErrorModal(true);
    }
  };

  return (
    <div className="page-container" style={{ minHeight: '100vh', padding: '0', backgroundColor: 'var(--dark-background)', display: 'flex', flexDirection: 'column' }}>
      <header className="app-header">
        <Link to="/" style={{ textDecoration: 'none', marginLeft: '23px' }}>
          <h1 className="app-header-title">Secure Print</h1>
        </Link>
        <nav className="app-header-nav">
          <Link to="/print" className="button-link">Access File</Link>
          <Link to="/register" className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)' }}>Register</Link>
        </nav>
      </header>
      <div className="form-card" style={{ maxWidth: '450px', margin: 'auto', padding: '2.5rem' }}>
        <h1 style={{ marginBottom: '1.5rem', color: 'var(--primary-color)' }}>Login</h1>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="email" style={{ color: 'var(--light-text-color)', marginBottom: '0.5rem', display: 'block' }}>Email:</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--dark-background)', color: 'var(--text-color)' }}
            />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="password" style={{ color: 'var(--light-text-color)', marginBottom: '0.5rem', display: 'block' }}>Password:</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--dark-background)', color: 'var(--text-color)' }}
            />
          </div>
          <button type="submit" className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)', fontSize: 'var(--button-font-size)', padding: 'var(--button-padding)', maxWidth: '250px', margin: '0 auto' }}>Login</button>
        </form>
        <p style={{ color: 'var(--light-text-color)' }}>Don't have an account? <a href="/register" style={{ color: 'var(--primary-color)' }}>Register here</a></p>
        <p style={{ color: 'var(--light-text-color)', marginTop: '1rem' }}>Need to access a print job? <Link to="/print" style={{ color: 'var(--primary-color)' }}>Access File</Link></p>
      </div>
      {/* Login Error Modal */}
      {showLoginErrorModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="form-card" style={{ maxWidth: '400px', padding: '2rem', backgroundColor: 'var(--card-background)', borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.5)' }}>
            <h3 style={{ color: 'var(--error-color)', marginBottom: '1.5rem' }}>Login Failed</h3>
            <p style={{ color: 'var(--light-text-color)', marginBottom: '1.5rem' }}>
              {loginErrorMessage}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLoginErrorModal(false)} className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)' }}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
