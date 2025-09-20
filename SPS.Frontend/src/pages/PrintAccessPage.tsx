import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom'; // Import useNavigate
import axios from 'axios';
import { Link } from 'react-router-dom'; // Import Link for homepage navigation
import { useAuth } from '../context/AuthContext.tsx'; // Import useAuth

const PrintAccessPage: React.FC = () => {
  const { token } = useParams<{ token: string }>(); // Token from URL parameters
  const [inputToken, setInputToken] = useState(''); // State for user-entered token
  const [secret, setSecret] = useState('');
  const [message, setMessage] = useState('Please enter your Secure Link and Secret to access your print job.');
  const [fileContentUrl, setFileContentUrl] = useState<string | null>(null);
  const [availableConnectors, setAvailableConnectors] = useState<Array<{ id: string; machineName: string; printers: Array<{ name: string; isDefault: boolean }> }>>([]); // Changed 'Name' to 'name'
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [showPrinterSelection, setShowPrinterSelection] = useState<boolean>(false);
  const [workerDownloadLink, setWorkerDownloadLink] = useState<string | null>(null);
  const [jobToken, setJobToken] = useState<string | null>(null); // New state to store the token for the current job
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://localhost:7192';
  const LOCAL_WORKER_API_BASE_URL = 'http://localhost:5000'; // Assuming worker runs on port 5000
  const { token: authToken, logout } = useAuth(); // Get auth token and logout function
  const [isAccessingJob, setIsAccessingJob] = useState(false); // New state for loading indicator
  const [isPrinting, setIsPrinting] = useState(false); // New state for loading indicator
  const [isPollingForPrinters, setIsPollingForPrinters] = useState(false); // New state for polling
  const [pollAttempts, setPollAttempts] = useState(0); // New state for poll attempts
  const MAX_POLL_ATTEMPTS = 5; // Max attempts for polling
  const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds

  const [showErrorModal, setShowErrorModal] = useState(false); // New state for error modal visibility
  const [modalErrorMessage, setModalErrorMessage] = useState(''); // New state for error message
  const [showPrintSuccessModal, setShowPrintSuccessModal] = useState(false); // New state for print success modal
  const [printSuccessMessage, setPrintSuccessMessage] = useState(''); // New state for print success message

  useEffect(() => {
    if (token) {
      setMessage('Secure Link pre-filled from URL. Please enter the File Secret to proceed.');
      setJobToken(token); // Set jobToken if it's from the URL
    }
  }, [token]);

  // Cleanup effect for polling
  useEffect(() => {
    let pollInterval: any | null = null; // Changed NodeJS.Timeout to any
    if (isPollingForPrinters && pollAttempts < MAX_POLL_ATTEMPTS) {
      pollInterval = setInterval(refetchAvailableConnectors, POLL_INTERVAL_MS);
    } else if (isPollingForPrinters && pollAttempts >= MAX_POLL_ATTEMPTS) {
      setMessage('No local print connector service found or no printers available after multiple attempts. Please ensure the connector is running and configured.');
      setIsPollingForPrinters(false);
      // Assuming workerDownloadLink will be set from the initial access-print-job response or config if needed
      // setWorkerDownloadLink(true); // This line was causing the error - removed.
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isPollingForPrinters, pollAttempts, MAX_POLL_ATTEMPTS]); // Dependencies for polling effect

  const refetchAvailableConnectors = async () => {
    setPollAttempts(prev => prev + 1);
    
    let currentLocalConnectorId: string | null = null;
    try {
      const workerResponse = await axios.get(`${LOCAL_WORKER_API_BASE_URL}/api/worker-info`);
      if (workerResponse.data && workerResponse.data.connectorId) {
        currentLocalConnectorId = workerResponse.data.connectorId;
      }
    } catch (workerErr) {
      // Error during worker info fetch, currentLocalConnectorId remains null
    }

    try {
      const payload: { fileSecret: string; localConnectorId?: string } = {
        fileSecret: secret,
      };
      if (currentLocalConnectorId) {
        payload.localConnectorId = currentLocalConnectorId;
      }
      const response = await axios.post(`${API_BASE_URL}/api/jobs/access-print-job/${jobToken}`, payload); // Use jobToken from state
      
      if (response.data.availableConnectors && response.data.availableConnectors.length > 0) {
        setAvailableConnectors(response.data.availableConnectors);
        const allPrinters = response.data.availableConnectors.flatMap((conn: { printers: any; }) => conn.printers);
        if (allPrinters.length > 0) {
          const defaultPrinterOption = allPrinters.find((p: { isDefault: boolean; }) => p.isDefault) || allPrinters[0];
          const selectedConn = response.data.availableConnectors.find((c: { printers: any[]; }) => c.printers.some((p: any) => p.name === defaultPrinterOption.name)); // Changed p.Name to p.name
          setSelectedPrinter(JSON.stringify({
            connectorId: selectedConn?.id || '',
            printerName: defaultPrinterOption.name, // Changed defaultPrinterOption.Name to .name
          }));
          setShowPrinterSelection(true);
          setMessage(response.data.message || 'Your file is ready for printing.');
          setIsPollingForPrinters(false); // Stop polling
        }
      } else if (response.data.workerDownloadLink) {
        setWorkerDownloadLink(response.data.workerDownloadLink);
      }
    } catch (err) {
      // Errors during refetch are often transient; main error handling is in handleSubmit.
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setFileContentUrl(null);
    setAvailableConnectors([]);
    setSelectedPrinter('');
    setShowPrinterSelection(false);
    setWorkerDownloadLink(null);
    setJobToken(null);

    let currentToken = token || inputToken;

    if (currentToken.includes('/print/')) {
      const tokenRegex = /\/print\/([a-f0-9-]+)/i;
      const match = currentToken.match(tokenRegex);
      currentToken = match ? match[1] : currentToken;
    }

    if (!currentToken) {
      // setError('Invalid Secure Link: Missing token. Please enter the full link.');
      setModalErrorMessage('Invalid Secure Link: Missing token. Please enter the full link.');
      setShowErrorModal(true);
      return;
    }
    if (!secret) {
      // setError('Please enter the File Secret to continue.');
      setModalErrorMessage('Please enter the File Secret to continue.');
      setShowErrorModal(true);
      return;
    }

    setIsAccessingJob(true); // Start loading for job access
    let currentLocalConnectorId: string | null = null;

    try {
      // Attempt to detect local worker ID directly before making the main API call
      const workerResponse = await axios.get(`${LOCAL_WORKER_API_BASE_URL}/api/worker-info`);
      if (workerResponse.data && workerResponse.data.connectorId) {
        currentLocalConnectorId = workerResponse.data.connectorId;
      }
    } catch (workerErr) {
      currentLocalConnectorId = null; // Ensure it's null if detection fails
    }

    try {
      const payload: { fileSecret: string; localConnectorId?: string } = {
        fileSecret: secret,
      };
      if (currentLocalConnectorId) {
        payload.localConnectorId = currentLocalConnectorId;
      }

      const response = await axios.post(`${API_BASE_URL}/api/jobs/access-print-job/${currentToken}`, payload);
      if (response.data.fileSasUrl) {
        setFileContentUrl(response.data.fileSasUrl);
        setMessage('Your file is ready for viewing, downloading, or printing.');
      }

      if (response.data.availableConnectors && response.data.availableConnectors.length > 0) {
        setAvailableConnectors(response.data.availableConnectors);
        const allPrinters = response.data.availableConnectors.flatMap((conn: { printers: any; }) => conn.printers);
        if (allPrinters.length > 0) {
          const defaultPrinterOption = allPrinters.find((p: { isDefault: boolean; }) => p.isDefault) || allPrinters[0];
          const selectedConn = response.data.availableConnectors.find((c: { printers: any[]; }) => c.printers.some((p: any) => p.name === defaultPrinterOption.name)); // Changed p.Name to p.name
          setSelectedPrinter(JSON.stringify({
            connectorId: selectedConn?.id || '',
            printerName: defaultPrinterOption.name, // Changed defaultPrinterOption.Name to .name
          }));
          setShowPrinterSelection(true);
          // Polling check moved here: if successful, stop polling
          if (isPollingForPrinters) {
            setIsPollingForPrinters(false);
            setMessage(response.data.message || 'Printers found. Your file is ready for printing.');
          }
        }
      } else if (!response.data.fileSasUrl && (!response.data.availableConnectors || response.data.availableConnectors.length === 0)) {
        // If direct access is NOT allowed and no connectors are found, initiate polling
        setMessage('Searching for local print connectors and printers...');
        setIsPollingForPrinters(true);
        setPollAttempts(0); // Reset attempts
      }

      if (response.data.message) {
        setMessage(response.data.message);
        if (response.data.workerDownloadLink) {
          setWorkerDownloadLink(response.data.workerDownloadLink);
        }
      } else if (!response.data.fileSasUrl && (!response.data.availableConnectors || response.data.availableConnectors.length === 0)) {
        setModalErrorMessage('An unexpected response was received. Please check the console for details.');
        setShowErrorModal(true);
      }
      setJobToken(currentToken);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        if (err.response.status === 401) {
          // setError('Incorrect File Secret provided.');
          setModalErrorMessage('Incorrect File Secret provided.');
          setShowErrorModal(true);
        } else if (err.response.status === 404) {
          // setError('Print job not found, has expired, or the file is unavailable.');
          setModalErrorMessage('Print job not found, has expired, or the file is unavailable.');
          setShowErrorModal(true);
        } else {
          // setError(`An unexpected error occurred: ${err.response.status} - ${err.response.data.detail || err.response.data}.`);
          setModalErrorMessage(`An unexpected error occurred: ${err.response.status} - ${err.response.data.detail || err.response.data}.`);
          setShowErrorModal(true);
        }
      } else {
        // setError('An unexpected error occurred. Please try again.');
        setModalErrorMessage('An unexpected error occurred. Please try again.');
        setShowErrorModal(true);
      }
    } finally {
      setIsAccessingJob(false);
    }
  };

  const handlePrint = async () => {

    if (!selectedPrinter || selectedPrinter === "" || !jobToken) {
      // setError('Unable to print: No printer selected or missing job token.');
      setModalErrorMessage('Unable to print: No printer selected or missing job token.');
      setShowErrorModal(true);
      return;
    }
    const parsedSelectedPrinter = JSON.parse(selectedPrinter);
    const { connectorId, printerName, connectorName } = parsedSelectedPrinter; // Added connectorName


    if (!connectorId || !printerName) {
      // setError('Unable to print: Invalid printer selection data.');
      setModalErrorMessage('Unable to print: Invalid printer selection data.');
      setShowErrorModal(true);
      return;
    }

    setIsPrinting(true); // Start loading
    try {
      // Assume there's an endpoint to re-send the print job to a specific printer
      await axios.post(`${API_BASE_URL}/api/jobs/reprint/${jobToken}`, {
        connectorId: connectorId,
        printerName: printerName,
        fileSecret: secret // Re-send secret for verification if needed
      });

      setPrintSuccessMessage(`Print job sent to ${printerName} on ${connectorName}.`); // Set message for modal
      setShowPrintSuccessModal(true); // Show success modal
      setShowPrinterSelection(false);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        // setError(`Error sending print job: ${err.response.data.message || err.response.data}.`);
        setModalErrorMessage(`Error sending print job: ${err.response.data.message || err.response.data}.`);
        setShowErrorModal(true);
      } else {
        // setError('An unexpected error occurred while sending the print job. Please try again.');
        setModalErrorMessage('An unexpected error occurred while sending the print job. Please try again.');
        setShowErrorModal(true);
      }
    } finally {
      setIsPrinting(false);
    }
  };

  const navigate = useNavigate(); // Get navigate hook
  const handlePrintSuccessAcknowledge = () => {
    setShowPrintSuccessModal(false); // Close the modal
    if (authToken) {
      navigate('/dashboard'); // Navigate to dashboard if logged in
    } else {
      navigate('/'); // Navigate to home page if not logged in
    }
  };

  return (
    <div className="page-container" style={{ minHeight: '100vh', padding: '0', backgroundColor: 'var(--dark-background)', display: 'flex', flexDirection: 'column' }}>
      <header className="app-header">
        <Link to="/" style={{ textDecoration: 'none', marginLeft: '23px' }}>
          <h1 className="app-header-title">Secure Print</h1>
        </Link>
        <nav className="app-header-nav">
          {authToken ? (
            <>
              <Link to="/dashboard" className="button-link">Dashboard</Link>
              <button onClick={logout} className="button-link" style={{ backgroundColor: 'var(--error-color)', color: 'var(--text-color)' }}>Logout</button>
            </>
          ) : (
            <>
              {/* Empty fragment if no buttons are needed when not logged in, but nav is still present for layout */}
            </>
          )}
        </nav>
      </header>
      <div className="form-card" style={{ maxWidth: '450px', margin: 'auto', padding: '2.5rem' }}>
        <h1 style={{ marginBottom: '1.5rem', color: 'var(--primary-color)' }}>Access Secure Print Job</h1>
        <p style={{ color: 'var(--light-text-color)' }}>{message}</p>
        {/* Replaced inline error display with modal trigger */}
        {/* {error && <p style={{ color: 'var(--error-color)' }}>{error}</p>} */}
        {!fileContentUrl && !showPrinterSelection && !isPollingForPrinters && ( // Only show form if we don't have file URL or printer selection yet, and not polling
          <form onSubmit={handleSubmit}>
            {!token && ( // Show token input only if not present in URL
              <div style={{ marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
                <label htmlFor="token" style={{ color: 'var(--light-text-color)' }}>Secure Link:</label>
                <input
                  type="text"
                  id="token"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--dark-background)', color: 'var(--text-color)' }}
                />
              </div>
            )}
            <div style={{ marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
              <label htmlFor="secret" style={{ color: 'var(--light-text-color)' }}>File Secret:</label>
              <input
                type="password"
                id="secret"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                required
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--dark-background)', color: 'var(--text-color)' }}
              />
            </div>
            <button type="submit" className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)', fontSize: 'var(--button-font-size)', padding: 'var(--button-padding)', maxWidth: '250px', margin: '0 auto' }} disabled={isAccessingJob}>
              {isAccessingJob ? 'Accessing...' : 'Access Print Job'}
            </button>
          </form>
        )}
        {isPollingForPrinters && ( // Show polling message
          <div style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--primary-color)' }}>
            <p>Searching for local print connectors and printers (attempt {pollAttempts}/{MAX_POLL_ATTEMPTS})...</p>
          </div>
        )}
        {showPrinterSelection && availableConnectors.length > 0 && ( // Show printer selection if enabled and printers are available
          <div style={{ marginTop: '2rem' }}>
            <h2 style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>Select a Printer</h2>
            <div style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="printerSelect" style={{ color: 'var(--light-text-color)', display: 'block', marginBottom: '0.5rem' }}>Available Printers:</label>
              <select
                id="printerSelect"
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 15px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-background)',
                  color: 'var(--text-color)',
                  fontSize: '1rem',
                  outline: 'none',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                  appearance: 'none', // Remove default browser styling
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
              >
                <option value="">Select a printer...</option>
                {availableConnectors.flatMap(connector =>
                  connector.printers.map(printer => {
                    return (
                      <option 
                        key={`${connector.id}-${printer.name}`}
                        value={JSON.stringify({ connectorId: connector.id, printerName: printer.name, connectorName: connector.machineName })}
                        style={{ backgroundColor: 'var(--input-background)', color: 'var(--text-color)' }} // Style options
                      >
                        {printer.name} on {connector.machineName} {printer.isDefault ? '(Default)' : ''}
                      </option>
                    );
                  })
                )}
              </select>
            </div>
            <button onClick={handlePrint} className="button-link" style={{ backgroundColor: 'var(--success-color)', color: 'var(--dark-background)', fontSize: 'var(--button-font-size)', padding: 'var(--button-padding)', maxWidth: '250px', margin: '0 auto' }} disabled={isPrinting || !selectedPrinter || selectedPrinter === ""}>
              {isPrinting ? 'Printing...' : 'Print to Selected Printer'}
            </button>
          </div>
        )}
        {workerDownloadLink && !isPollingForPrinters && ( // Display download link only if worker not detected AND not polling
          <div style={{ marginTop: '1.5rem', maxWidth: '400px', margin: '1.5rem auto' }}>
            <p style={{ color: 'var(--light-text-color)', marginBottom: '1rem' }}>The print connector service is not detected on your PC. You can download it here:</p>
            <a href={workerDownloadLink} target="_blank" rel="noopener noreferrer" className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)' }}>Download Print Connector</a>
          </div>
        )}
        {fileContentUrl && (
          <div style={{ marginTop: '2rem', width: '100%', height: 'calc(100vh - 250px)', maxWidth: '800px', margin: '2rem auto',marginBottom: '75px' }}>
            <p style={{ color: 'var(--light-text-color)', marginBottom: '1rem' }}>Your file is ready for viewing or downloading:</p>
            <a href={fileContentUrl} target="_blank" rel="noopener noreferrer" className="button-link" style={{ backgroundColor: 'var(--primary-color)', color: 'var(--dark-background)', marginBottom: '1rem', display: 'inline-block' }}>Download File</a>
            <iframe src={fileContentUrl} style={{ width: '100%', height: '100%', border: '1px solid var(--border-color)', borderRadius: '8px' }} title="Printable Document"></iframe>
          </div>
        )}
      </div>
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
              {modalErrorMessage}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowErrorModal(false)} className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)' }}>OK</button>
            </div>
          </div>
        </div>
      )}
      {/* Print Success Modal */}
      {showPrintSuccessModal && (
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
            <h3 style={{ color: 'var(--success-color)', marginBottom: '1.5rem' }}>Print Job Sent!</h3>
            <p style={{ color: 'var(--light-text-color)', marginBottom: '1.5rem' }}>
              {printSuccessMessage}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handlePrintSuccessAcknowledge} className="button-link" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--dark-background)' }}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrintAccessPage;