import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import axios from 'axios';
import FileUploadComponent from '../components/FileUploadComponent.tsx';
import { Link } from 'react-router-dom'; // Import Link for homepage navigation

interface UserFile {
  id: string;
  originalFileName: string;
  blobPath: string;
  uploadedTimestamp: string;
  secret?: string; // Optional: will be set after reset or initial upload
  secureLink?: string; // Add secureLink property
}

interface PrintJob {
  id: string;
  fileId: string;
  status: string;
  secureLinkToken: string;
  expiryTimestamp: string;
}

const DashboardPage: React.FC = () => {
  const { token, logout } = useAuth();
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [revealedSecretId, setRevealedSecretId] = useState<string | null>(null); // New state to track which secret is revealed
  const [showSecretModal, setShowSecretModal] = useState<boolean>(false); // State for modal visibility
  const [currentFileForSecret, setCurrentFileForSecret] = useState<UserFile | null>(null); // To hold the file being acted on
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false); // New state for delete modal visibility
  const [fileToDeleteId, setFileToDeleteId] = useState<string | null>(null); // New state for file ID to delete
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false); // New state for success modal visibility
  const [successMessage, setSuccessMessage] = useState<string | null>(null); // New state for success message
  const [resetUploadFormKey, setResetUploadFormKey] = useState<number>(0); // New state to trigger FileUploadComponent reset
  const [newSecret, setNewSecret] = useState<string>(''); // State for new secret input
  const [confirmNewSecret, setConfirmNewSecret] = useState<string>(''); // State for confirm new secret input
  const [newSecretError, setNewSecretError] = useState<string | null>(null); // State for new secret error
  const [confirmNewSecretError, setConfirmNewSecretError] = useState<string | null>(null); // State for confirm new secret error
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://localhost:7192';

  // Helper function to generate a random secret
  const generateRandomSecret = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const fetchUserFilesAndJobs = async () => {
    if (!token) return;

    try {
      const filesResponse = await axios.get(`${API_BASE_URL}/api/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const jobsResponse = await axios.get(`${API_BASE_URL}/api/jobs/my-jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPrintJobs(jobsResponse.data);
      setUserFiles(filesResponse.data);
    } catch (error) {
      console.error('Failed to fetch user files or jobs:', error);
    }
  };

  const handleShowOrResetSecret = async (fileId: string) => {
    // Instead of direct API call, open the modal
    const fileToReset = userFiles.find(file => file.id === fileId);
    if (fileToReset) {
      setCurrentFileForSecret(fileToReset);
      setNewSecret('');
      setConfirmNewSecret('');
      setNewSecretError(null);
      setConfirmNewSecretError(null);
      setShowSecretModal(true);
    }
  };

  const handleGenerateRandomSecret = () => {
    const randomSecret = generateRandomSecret();
    setNewSecret(randomSecret);
    setConfirmNewSecret(randomSecret);
    setNewSecretError(null);
    setConfirmNewSecretError(null);
  };

  const handleSecretModalSubmit = async () => {
    if (!token || !currentFileForSecret) return;

    setNewSecretError(null);
    setConfirmNewSecretError(null);

    if (!newSecret) {
      setNewSecretError('New secret is required.');
      return;
    }

    if (newSecret.length < 6) {
      setNewSecretError('New secret must be at least 6 characters long.');
      return;
    }

    if (newSecret !== confirmNewSecret) {
      setConfirmNewSecretError('Secrets do not match. Please re-enter.');
      return;
    }

    // Proceed with API call to update the secret
    try {
      const response = await axios.post(`${API_BASE_URL}/api/files/reset-secret/${currentFileForSecret.id}`, { newSecret: newSecret }, // Pass the new secret
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const updatedFileSecret = response.data.secret;
      setUserFiles((prevFiles) =>
        prevFiles.map((file) =>
          file.id === currentFileForSecret.id ? { ...file, secret: updatedFileSecret } : file
        )
      );
      setShowSecretModal(false); // Close modal on success
      setSuccessMessage('File secret updated successfully!');
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Failed to update file secret:', error);
      setSuccessMessage('Failed to update file secret.');
      setShowSuccessModal(true);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    // Open the delete confirmation modal
    setFileToDeleteId(fileId);
    setShowDeleteModal(true);
  };

  const confirmFileDeletion = async () => {
    if (!token || !fileToDeleteId) return;

    try {
      await axios.delete(`${API_BASE_URL}/api/files/${fileToDeleteId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUserFiles((prevFiles) => prevFiles.filter((file) => file.id !== fileToDeleteId));
      setPrintJobs((prevJobs) => prevJobs.filter((job) => job.fileId !== fileToDeleteId)); // Also remove associated print jobs
      // alert('File and associated print jobs deleted successfully!'); // Remove alert
      setSuccessMessage('File and associated print jobs deleted successfully!');
      setShowSuccessModal(true);
      setResetUploadFormKey(prevKey => prevKey + 1); // Trigger FileUploadComponent reset
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert('Failed to delete file.');
    } finally {
      setShowDeleteModal(false);
      setFileToDeleteId(null);
    }
  };

  useEffect(() => {
    fetchUserFilesAndJobs();
    setRevealedSecretId(null); // Reset revealed secret when files/jobs are re-fetched
  }, [token]);

  return (
    <div className="page-container" style={{ minHeight: '100vh', padding: '0', backgroundColor: 'var(--dark-background)', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
      <header className="app-header">
        <Link to="/" style={{ textDecoration: 'none', marginLeft: '23px' }}>
          <h1 className="app-header-title">Secure Print</h1>
        </Link>
        <nav className="app-header-nav">
          {token ? (
            <>
              <Link to="/print" className="button-link">Access File</Link>
              <button onClick={logout} className="button-link" style={{ backgroundColor: 'var(--error-color)', color: 'var(--text-color)' }}>Logout</button>
            </>
          ) : (
            <>
              {/* Empty fragment to maintain flex layout when not logged in */}
            </>
          )}
        </nav>
      </header>

      <div style={{ flexGrow: '1', width: '100%', maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
        <h1 style={{ margin: '0 0 2rem 0', fontSize: '2.5rem', color: 'var(--primary-color)' }}>Dashboard</h1>
        <p style={{ color: 'var(--light-text-color)', marginBottom: '1.5rem' }}>
          <strong style={{ color: 'var(--accent-color)' }}>Important Security Note:</strong> We do not store your file secrets. If you forget a secret, you can generate a new one, which will invalidate any previous secret for that file.
        </p>
        <FileUploadComponent onFileUploadSuccess={fetchUserFilesAndJobs} resetFormTrigger={resetUploadFormKey} />

        <h2 style={{ marginTop: '2rem', color: 'var(--primary-color)' }}>Your Uploaded Files</h2>
        {userFiles.length === 0 ? (
          <p style={{ color: 'var(--light-text-color)' }}>No files uploaded yet.</p>
        ) : (
          <ul style={{ width: '100%', maxWidth: '800px', margin: '1rem auto' }}>
            {userFiles.map((file) => (
              <li key={file.id} style={{ flexDirection: 'column', alignItems: 'flex-start', backgroundColor: 'var(--card-background)', border: '1px solid var(--border-color)', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-color)' }}>{file.originalFileName} (ID: {file.id.substring(0, 8)})</span>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => handleShowOrResetSecret(file.id)} className="button-link" style={{ padding: '5px 10px', fontSize: '0.8em', backgroundColor: 'var(--secondary-color)', color: 'var(--primary-color)' }}>
                      {file.id === revealedSecretId && file.secret ? 'Hide Secret' : 'Generate New Secret'}
                    </button>
                    {file.id === revealedSecretId && file.secret && (
                      <>
                        <button onClick={() => navigator.clipboard.writeText(file.secret!)} className="button-link" style={{ padding: '5px 10px', fontSize: '0.8em', backgroundColor: 'var(--light-text-color)', color: 'var(--dark-background)' }}>
                          Copy Secret
                        </button>
                        <button onClick={() => setRevealedSecretId(null)} className="button-link" style={{ padding: '5px 10px', fontSize: '0.8em', backgroundColor: 'var(--error-color)', color: 'var(--text-color)' }}>
                          Hide Secret
                        </button>
                      </>
                    )}
                    <button onClick={() => handleDeleteFile(file.id)} className="button-link" style={{ padding: '5px 10px', fontSize: '0.8em', backgroundColor: 'var(--error-color)', color: 'var(--text-color)' }}>Delete File</button>
                  </div>
                </div>
                {/* The Secret display part will remain, but `revealedSecretId` will be set by modal submission */}
                {file.id === revealedSecretId && file.secret && (
                  <div style={{ fontSize: '0.9em', color: 'var(--primary-color)', marginTop: '0.5rem' }}>
                    Secret: <strong style={{ color: 'var(--accent-color)' }}>{file.secret}</strong>
                    <button onClick={() => navigator.clipboard.writeText(file.secret!)} className="button-link" style={{ padding: '5px 10px', fontSize: '0.8em', backgroundColor: 'var(--light-text-color)', color: 'var(--dark-background)', marginLeft: '10px' }}>Copy Secret</button>
                  </div>
                )}
                {file.secureLink && (
                  <div style={{ fontSize: '0.9em', color: 'var(--light-text-color)', marginTop: '0.5rem' }}>
                    Secure Link: <a href={file.secureLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)', wordBreak: 'break-all' }}>{file.secureLink}</a>
                    <button onClick={() => navigator.clipboard.writeText(file.secureLink!)} className="button-link" style={{ padding: '5px 10px', fontSize: '0.8em', backgroundColor: 'var(--light-text-color)', color: 'var(--dark-background)', marginLeft: '10px' }}>Copy Link</button>
                  </div>
                )}
                <span style={{ fontSize: '0.8em', color: 'var(--light-text-color)' }}>
                  Uploaded: {new Date(file.uploadedTimestamp).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && fileToDeleteId && (
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
              <h3 style={{ color: 'var(--primary-color)', marginBottom: '1.5rem' }}>Confirm Deletion</h3>
              <p style={{ color: 'var(--light-text-color)', marginBottom: '1.5rem' }}>
                Are you sure you want to delete this file and all associated print jobs? This action cannot be undone.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button onClick={() => setShowDeleteModal(false)} className="button-link" style={{ backgroundColor: 'var(--secondary-color)', color: 'var(--primary-color)' }}>Cancel</button>
                <button onClick={confirmFileDeletion} className="button-link" style={{ backgroundColor: 'var(--error-color)', color: 'var(--text-color)' }}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Success Modal */}
        {showSuccessModal && successMessage && (
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
              <h3 style={{ color: 'var(--primary-color)', marginBottom: '1.5rem' }}>Success!</h3>
              <p style={{ color: 'var(--light-text-color)', marginBottom: '1.5rem' }}>
                {successMessage}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowSuccessModal(false)} className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)' }}>OK</button>
              </div>
            </div>
          </div>
        )}

        {/* New Secret Reset Modal */}
        {showSecretModal && currentFileForSecret && (
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
            <div className="form-card" style={{ maxWidth: '500px', padding: '2rem', backgroundColor: 'var(--card-background)', borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.5)' }}>
              <h3 style={{ color: 'var(--primary-color)', marginBottom: '1.5rem' }}>Generate New Secret for "{currentFileForSecret.originalFileName}"</h3>
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="newSecretInput" style={{ color: 'var(--light-text-color)', marginBottom: '0.5rem', display: 'block' }}>New Secret:</label>
                <input
                  type="text"
                  id="newSecretInput"
                  value={newSecret}
                  onChange={(e) => {
                    setNewSecret(e.target.value);
                    setNewSecretError(null);
                  }}
                  placeholder="Enter new secret"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--dark-background)', color: 'var(--text-color)' }}
                />
                {newSecretError && <p style={{ color: 'var(--error-color)', fontSize: '0.8em', marginTop: '0.5rem' }}>{newSecretError}</p>}
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="confirmNewSecretInput" style={{ color: 'var(--light-text-color)', marginBottom: '0.5rem', display: 'block' }}>Confirm New Secret:</label>
                <input
                  type="text"
                  id="confirmNewSecretInput"
                  value={confirmNewSecret}
                  onChange={(e) => {
                    setConfirmNewSecret(e.target.value);
                    setConfirmNewSecretError(null);
                  }}
                  placeholder="Confirm new secret"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--dark-background)', color: 'var(--text-color)' }}
                />
                {confirmNewSecretError && <p style={{ color: 'var(--error-color)', fontSize: '0.8em', marginTop: '0.5rem' }}>{confirmNewSecretError}</p>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
                <button onClick={handleGenerateRandomSecret} className="button-link" style={{ backgroundColor: 'var(--secondary-color)', color: 'var(--primary-color)' }}>Generate Random Secret</button>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={() => setShowSecretModal(false)} className="button-link" style={{ backgroundColor: 'var(--error-color)', color: 'var(--text-color)' }}>Cancel</button>
                  <button onClick={handleSecretModalSubmit} className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)' }}>Submit</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <h2 style={{ marginTop: '2rem', color: 'var(--primary-color)' }}>Your Print Jobs</h2>
        {printJobs.length === 0 ? (
          <p style={{ color: 'var(--light-text-color)' }}>No print jobs created yet.</p>
        ) : (
          <ul style={{ width: '100%', maxWidth: '800px', margin: '1rem auto' }}>
            {printJobs.map((job) => {
              const file = userFiles.find(f => f.id === job.fileId);
              return (
                <li key={job.id} style={{ flexDirection: 'column', alignItems: 'flex-start', backgroundColor: 'var(--card-background)', border: '1px solid var(--border-color)', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-color)' }}>File: <strong style={{ color: 'var(--accent-color)' }}>{file ? `${file.originalFileName} (ID: ${file.id.substring(0, 8)})` : 'Unknown File'}</strong></span>
                    <span style={{ color: 'var(--text-color)' }}>Status: <strong style={{ color: job.status === 'Printed' ? 'var(--success-color)' : 'var(--primary-color)' }}>{job.status}</strong></span>
                  </div>
                  <span style={{ fontSize: '0.8em', color: 'var(--light-text-color)' }}>
                    Expires: {new Date(job.expiryTimestamp).toLocaleDateString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
