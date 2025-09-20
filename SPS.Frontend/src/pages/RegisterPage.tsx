import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom'; // Import Link for homepage navigation

const RegisterPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register(email, password);
      navigate('/dashboard'); // Redirect to dashboard on successful registration
    } catch (error) {
      console.error('Registration failed:', error);
      alert('Registration failed. Please try again.');
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
          <Link to="/login" className="button-link">Login</Link>
        </nav>
      </header>
      <div className="form-card" style={{ maxWidth: '450px', margin: 'auto', padding: '2.5rem' }}>
        <h1 style={{ marginBottom: '1.5rem', color: 'var(--primary-color)' }}>Register</h1>
        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email">Email:</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="password">Password:</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)', fontSize: 'var(--button-font-size)', padding: 'var(--button-padding)' }}>Register</button>
        </form>
        <p style={{ color: 'var(--light-text-color)' }}>Already have an account? <a href="/login" style={{ color: 'var(--primary-color)' }}>Login here</a></p>
        <p style={{ color: 'var(--light-text-color)', marginTop: '1rem' }}>Need to access a print job? <Link to="/print" style={{ color: 'var(--primary-color)' }}>Access File</Link></p>
      </div>
    </div>
  );
};

export default RegisterPage;
