import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.tsx';

function App() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [accessFileToken, setAccessFileToken] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false); // New state for error modal visibility
  const [errorMessage, setErrorMessage] = useState(''); // New state for error message

  const handleAccessFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessFileToken) {
      const tokenRegex = /\/print\/([a-f0-9-]+)/i;
      const match = accessFileToken.match(tokenRegex);
      const tokenToNavigate = match ? match[1] : accessFileToken;

      navigate(`/print/${tokenToNavigate}`);
    } else {
      // alert('Please enter the Secure Link.'); // Replaced with modal
      setErrorMessage('Please enter the Secure Link.');
      setShowErrorModal(true);
    }
  };

  const handleScrollToAccessFile = () => {
    const accessFileSection = document.getElementById('access-file-section');
    if (accessFileSection) {
      accessFileSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="App" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--dark-background)' }}>
      <header className="app-header">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <h1 className="app-header-title">Secure Print</h1>
        </Link>
        <nav className="app-header-nav" style={{marginRight: '35px'}}>
          {!token ? (
            <>
              <Link to="/login" className="button-link">Login</Link>
              <Link to="/register" className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)' }}>Register</Link>
              <button onClick={handleScrollToAccessFile} className="button-link" style={{ backgroundColor: 'var(--secondary-color)', color: 'var(--primary-color)' }}>Access File</button>
            </>
          ) : (
            <>
              <Link to="/dashboard" className="button-link">Dashboard</Link>
              <button onClick={logout} className="button-link" style={{ backgroundColor: 'var(--error-color)', color: 'var(--text-color)' }}>Logout</button>
              <Link to="/print" className="button-link" style={{ backgroundColor: 'var(--secondary-color)', color: 'var(--primary-color)' }}>Access File</Link>
            </>
          )}
        </nav>
      </header>

      <section style={{ 
        flexGrow: '1',
        padding: '8rem 2rem',
        textAlign: 'center',
        color: 'var(--text-color)',
        background: 'linear-gradient(135deg, var(--secondary-color) 0%, var(--dark-background) 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%'
      }}>
        <h1 style={{ fontSize: '4rem', marginBottom: '1.5rem', color: 'var(--primary-color)', textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>Secure Print Service</h1>
        <p style={{ fontSize: '1.5rem', margin: '0 auto', color: 'var(--light-text-color)', maxWidth: '900px', padding: '0 1rem' }}>
          Your trusted platform for secure and confidential document printing.
          Upload, share, and print without compromising your digital files.
        </p>
        <div style={{ marginTop: '3rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/register" className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)' }}>Get Started</Link>
          <a href="#product-details" className="button-link" style={{ backgroundColor: 'var(--dark-background)', color: 'var(--primary-color)' }}>Learn More</a>
        </div>
      </section>

      <section id="product-details" style={{ padding: '6rem 2rem', backgroundColor: 'var(--card-background)', textAlign: 'center', borderRadius: '0', boxShadow: 'none', margin: '0 auto', maxWidth: 'none', position: 'relative', zIndex: '2', width: '100%' }}>
        <h2 style={{ fontSize: '2.8rem', marginBottom: '2rem', color: 'var(--primary-color)' }}>How It Works</h2>
        <p style={{ fontSize: '1.2rem', lineHeight: '1.8', margin: '0 auto 3rem auto', color: 'var(--light-text-color)', maxWidth: '900px', padding: '0 1rem' }}>
          Secure Print Service provides a revolutionary way to handle sensitive documents.
          Upload your files, generate a unique Secure Link with a File Secret, and share it with your trusted print shop.
          The print shop utilizes our secure worker application to retrieve and print your document once, ensuring the digital file is never stored on their systems.
          Your privacy is our priority.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2.5rem', flexWrap: 'wrap', maxWidth: '1100px', margin: '0 auto', padding: '0 1rem' }}>
          <div style={{ flex: '1 1 300px', padding: '2rem', border: '1px solid var(--border-color)', borderRadius: '12px', textAlign: 'center', boxShadow: '0 4px 15px rgba(0,0,0,0.3)', backgroundColor: 'var(--dark-background)' }}>
            <h3 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>1. Upload Securely</h3>
            <p style={{ color: 'var(--light-text-color)' }}>Your documents are uploaded to Azure Blob Storage with encryption at rest, and are accessed only via time-limited, secret-protected links.</p>
          </div>
          <div style={{ flex: '1 1 300px', padding: '2rem', border: '1px solid var(--border-color)', borderRadius: '12px', textAlign: 'center', boxShadow: '0 4px 15px rgba(0,0,0,0.3)', backgroundColor: 'var(--dark-background)' }}>
            <h3 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>2. Share Confidentially</h3>
            <p style={{ color: 'var(--light-text-color)' }}>Generate a unique, single-use Secure Link and a private File Secret for your print job. Share only with authorized personnel.</p>
          </div>
          <div style={{ flex: '1 1 300px', padding: '2rem', border: '1px solid var(--border-color)', borderRadius: '12px', textAlign: 'center', boxShadow: '0 4px 15px rgba(0,0,0,0.3)', backgroundColor: 'var(--dark-background)' }}>
            <h3 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>3. Print Privately</h3>
            <p style={{ color: 'var(--light-text-color)' }}>Our Windows Worker Service downloads the file directly from Azure, prints it, and deletes all local copies, ensuring no digital footprint remains on the printing system.</p>
          </div>
        </div>
      </section>

      <section id="access-file-section" style={{ padding: '6rem 2rem', backgroundColor: 'var(--secondary-color)', textAlign: 'center', width: '100%' }}>
        <div className="form-card" style={{ maxWidth: '700px', margin: '0 auto', padding: '3rem', backgroundColor: 'var(--card-background)', boxShadow: '0 8px 20px rgba(0,0,0,0.4)' }}>
          <h2 style={{ fontSize: '2.5rem', marginBottom: '2rem', color: 'var(--primary-color)' }}>Access Your Secure Print Job</h2>
          <p style={{ color: 'var(--light-text-color)', marginBottom: '1.5rem' }}>
            <strong style={{ color: 'var(--accent-color)' }}>Important Security Note:</strong> For your protection, we do not store your file secrets. If you forget a secret, you will need to ask the file owner to generate a new one, which will invalidate any previous secret for that file.
          </p>
          <form onSubmit={handleAccessFile} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
            <input 
              type="text" 
              placeholder="Paste your Secure Link here" 
              value={accessFileToken} 
              onChange={(e) => setAccessFileToken(e.target.value)} 
              style={{ width: '100%', maxWidth: '450px' }}
              required
            />
            <button type="submit" className="button-link" style={{ maxWidth: '250px', alignSelf: 'center', backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)' }}>Access File</button>
          </form>
        </div>
      </section>

      <section style={{ padding: '6rem 2rem', textAlign: 'center', backgroundColor: 'var(--dark-background)', color: 'var(--text-color)', width: '100%' }}>
        <h2 style={{ fontSize: '2.5rem', marginBottom: '2rem', color: 'var(--primary-color)' }}>For Print Shops: Download Our Secure Print Connector</h2>
        <p style={{ fontSize: '1.2rem', margin: '0 auto 3rem auto', color: 'var(--light-text-color)', maxWidth: '900px', padding: '0 1rem' }}>
          Integrate seamlessly with the Secure Print Service. Download our lightweight Windows Print Connector
          to securely receive and process print jobs directly from your clients, ensuring data privacy and efficient workflows.
        </p>
        <a href="#" className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)' }}>Download Connector (Windows)</a>
      </section>

      <footer style={{ padding: '2.5rem', textAlign: 'center', backgroundColor: 'var(--dark-background)', color: 'var(--text-color)', marginTop: '0', width: '100%' }}>
        <p>&copy; {new Date().getFullYear()} Secure Print Service by Nikhil. All rights reserved.</p>
      </footer>
      {/* Generic Error Modal */}
      {showErrorModal && (
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
            <h3 style={{ color: 'var(--error-color)', marginBottom: '1.5rem' }}>Error</h3>
            <p style={{ color: 'var(--light-text-color)', marginBottom: '1.5rem' }}>
              {errorMessage}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowErrorModal(false)} className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)' }}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App
