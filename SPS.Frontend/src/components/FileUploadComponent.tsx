import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext.tsx';

interface FileUploadComponentProps {
  onFileUploadSuccess: () => void;
  resetFormTrigger: number; // New prop to trigger form reset
}

const FileUploadComponent: React.FC<FileUploadComponentProps> = ({ onFileUploadSuccess, resetFormTrigger }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [secureLink, setSecureLink] = useState<string | null>(null);
  const [userProvidedSecret, setUserProvidedSecret] = useState<string>(''); // New state for user-provided secret
  const [confirmSecret, setConfirmSecret] = useState<string>(''); // New state for confirming secret
  const [allowDirectAccess, setAllowDirectAccess] = useState(false); // New state for direct access
  const { token } = useAuth();
  const [fileInputKey, setFileInputKey] = useState(Date.now()); // New state for clearing file input

  // New state variables for inline error messages
  const [fileError, setFileError] = useState<string | null>(null);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [confirmSecretError, setConfirmSecretError] = useState<string | null>(null);
  const [showUploadErrorModal, setShowUploadErrorModal] = useState(false); // New state for upload error modal
  const [uploadErrorMessage, setUploadErrorMessage] = useState(''); // New state for upload error message

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://localhost:7192';

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
      setSecureLink(null); // Clear previous link
      setUserProvidedSecret(''); // Clear user-provided secret
      setConfirmSecret(''); // Clear confirm secret
      setFileError(null); // Clear file error
      setSecretError(null); // Clear secret error
      setConfirmSecretError(null); // Clear confirm secret error
    } else {
      setSelectedFile(null);
    }
  };

  const handleGenerateRandomSecret = () => {
    const randomSecret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    setUserProvidedSecret(randomSecret);
    setConfirmSecret(randomSecret);
    setSecretError(null);
    setConfirmSecretError(null);
  };

  const handleUpload = async () => {
    // Clear previous errors
    setFileError(null);
    setSecretError(null);
    setConfirmSecretError(null);
    setUploadErrorMessage(''); // Clear previous upload error message
    setShowUploadErrorModal(false); // Hide previous upload error modal

    if (!selectedFile) {
      setFileError('Please select a file first!');
      return;
    }
    if (!token) {
      // alert('You must be logged in to upload files.'); // Replaced with modal
      setUploadErrorMessage('You must be logged in to upload files.');
      setShowUploadErrorModal(true);
      return;
    }

    if (!userProvidedSecret) {
      setSecretError('File secret is required.');
      return;
    }

    if (userProvidedSecret.length < 6) {
      setSecretError('Your secret must be at least 6 characters long.');
      return;
    }

    if (userProvidedSecret !== confirmSecret) {
      setConfirmSecretError('Secrets do not match. Please re-enter.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('allowDirectAccess', allowDirectAccess.toString()); // Append the new field
    formData.append('userProvidedSecret', userProvidedSecret); // User-provided secret is now mandatory

    try {
      const uploadResponse = await axios.post(`${API_BASE_URL}/api/files/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`,
        },
      });

      // Create print job
      const jobResponse = await axios.post(`${API_BASE_URL}/api/jobs`, { fileId: uploadResponse.data.id }, { // Use uploadResponse.data.id directly
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setSecureLink(jobResponse.data.secureLink);

      onFileUploadSuccess();

    } catch (error) {
      // alert('Failed to upload file or create print job.'); // Replaced with modal
      setUploadErrorMessage('Failed to upload file or create print job.');
      setShowUploadErrorModal(true);
    } finally {
      setUploading(false);
      setSelectedFile(null);
      // Clear secret input fields after upload attempt
      setUserProvidedSecret('');
      setConfirmSecret('');
      // Also clear any lingering error messages
      setFileError(null);
      setSecretError(null);
      setConfirmSecretError(null);
      // Reset file input by changing its key
      setFileInputKey(Date.now());
    }
  };

  // Effect to reset form when resetFormTrigger changes
  React.useEffect(() => {
    setSelectedFile(null);
    setSecureLink(null);
    setUserProvidedSecret('');
    setConfirmSecret('');
    setFileError(null);
    setSecretError(null);
    setConfirmSecretError(null);
    setFileInputKey(Date.now());
  }, [resetFormTrigger]);

  return (
    <div className="form-card" style={{ width: '100%', maxWidth: '800px', margin: '2rem auto', padding: '2.5rem' }}>
      <h2 style={{ marginBottom: '1.5rem', color: 'var(--primary-color)' }}>Upload New Document</h2>
      <div style={{ marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
        <input key={fileInputKey} type="file" onChange={handleFileChange} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', backgroundColor: 'var(--dark-background)', color: 'var(--text-color)', width: '100%' }} />
        {fileError && <p style={{ color: 'var(--error-color)', fontSize: '0.8em', marginTop: '0.5rem' }}>{fileError}</p>}
      </div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
        <input
          type="checkbox"
          id="allowDirectAccess"
          checked={allowDirectAccess}
          onChange={(e) => setAllowDirectAccess(e.target.checked)}
          style={{ marginRight: '10px', width: 'auto' }}
        />
        <label htmlFor="allowDirectAccess" style={{ color: 'var(--light-text-color)', margin: '0', fontWeight: 'normal' }}>Allow direct file viewing/download</label>
      </div>

      <div style={{ marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
        <label htmlFor="fileSecretInput" style={{ color: 'var(--light-text-color)', marginBottom: '0.5rem', display: 'block' }}>Set File Secret:</label>
        <input
          type="text"
          id="fileSecretInput"
          value={userProvidedSecret}
          onChange={(e) => {
            setUserProvidedSecret(e.target.value);
            setSecretError(null); // Clear error on change
          }}
          placeholder="Enter your file secret"
          style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', backgroundColor: 'var(--dark-background)', color: 'var(--text-color)', width: '100%' }}
          required
        />
        {secretError && <p style={{ color: 'var(--error-color)', fontSize: '0.8em', marginTop: '0.5rem' }}>{secretError}</p>}
      </div>

      <div style={{ marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
        <label htmlFor="confirmSecretInput" style={{ color: 'var(--light-text-color)', marginBottom: '0.5rem', display: 'block' }}>Confirm Secret:</label>
        <input
          type="text"
          id="confirmSecretInput"
          value={confirmSecret}
          onChange={(e) => {
            setConfirmSecret(e.target.value);
            setConfirmSecretError(null); // Clear error on change
          }}
          placeholder="Confirm your file secret"
          style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', backgroundColor: 'var(--dark-background)', color: 'var(--text-color)', width: '100%' }}
          required
        />
        {confirmSecretError && <p style={{ color: 'var(--error-color)', fontSize: '0.8em', marginTop: '0.5rem' }}>{confirmSecretError}</p>}
      </div>

      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
        <button onClick={handleGenerateRandomSecret} className="button-link" style={{ backgroundColor: 'var(--secondary-color)', color: 'var(--primary-color)', padding: '8px 12px', fontSize: '0.8em', flexGrow: 1, marginRight: '10px' }}>Generate Random Secret</button>
        <button onClick={handleUpload} disabled={!selectedFile || uploading} className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)', flexGrow: 1 }}>
          {uploading ? 'Uploading...' : 'Upload & Create Print Job'}
        </button>
      </div>
      {/* The secure link display remains below these buttons */}
      {secureLink && (
        <div className="secure-link-display" style={{ maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
          <p style={{ color: 'var(--primary-color)' }}>Secure Print Link:</p>
          <a href={secureLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-color)' }}>{secureLink}</a>
          <button onClick={() => navigator.clipboard.writeText(secureLink)} className="button-link" style={{ backgroundColor: 'var(--light-text-color)', color: 'var(--dark-background)', padding: '8px 12px', fontSize: '0.8em' }}>Copy Link</button>
        </div>
      )}

      {/* Removed File Secret display after upload as per user request */}
      {/* Generic Error Modal for Upload Component */}
      {showUploadErrorModal && (
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
            <h3 style={{ color: 'var(--error-color)', marginBottom: '1.5rem' }}>Upload Error</h3>
            <p style={{ color: 'var(--light-text-color)', marginBottom: '1.5rem' }}>
              {uploadErrorMessage}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowUploadErrorModal(false)} className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)' }}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploadComponent;
