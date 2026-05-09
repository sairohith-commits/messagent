import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';

const POLL_MS = 3000; // re-fetch status every 3 s while waiting for scan

export default function WhatsAppQR({ onConnected, onClose }) {
  const [state,   setState]   = useState({ status: 'idle' });
  const [error,   setError]   = useState('');
  const pollRef = useRef(null);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function startConnect() {
    setError('');
    setState({ status: 'starting' });
    try {
      await api.waConnect();
      pollStatus();
      pollRef.current = setInterval(pollStatus, POLL_MS);
    } catch (err) {
      setError(err.message);
      setState({ status: 'idle' });
    }
  }

  async function pollStatus() {
    try {
      const s = await api.waStatus();
      setState(s);
      if (s.status === 'connected') {
        stopPolling();
        onConnected?.(s.phoneNumber);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    // Check current status immediately when modal opens
    api.waStatus().then((s) => {
      setState(s);
      if (s.status === 'connected') onConnected?.(s.phoneNumber);
    }).catch(() => {});

    return stopPolling;
  }, []);

  const isConnected  = state.status === 'connected';
  const isQrPending  = state.status === 'qr_pending';
  const isConnecting = state.status === 'connecting' || state.status === 'starting';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Connect WhatsApp</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {isConnected && (
            <div className="connect-success">
              <div className="connect-icon">✓</div>
              <strong>Connected!</strong>
              <p>WhatsApp is active on +{state.phoneNumber}</p>
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          )}

          {isQrPending && state.qrCode && (
            <>
              <p className="modal-instruction">
                Open WhatsApp on your phone → Settings → Linked Devices → Link a Device, then scan:
              </p>
              <div className="qr-wrapper">
                <img src={state.qrCode} alt="WhatsApp QR code" className="qr-image" />
              </div>
              <p className="modal-hint">QR code refreshes automatically. Waiting for scan…</p>
            </>
          )}

          {isConnecting && (
            <div className="modal-loading">
              <div className="spinner" />
              <p>Starting WhatsApp connection…</p>
            </div>
          )}

          {state.status === 'idle' && (
            <>
              <p className="modal-instruction">
                Messagent uses WhatsApp Web to auto-reply to your personal messages.
                No business account required — just scan a QR code.
              </p>
              <ul className="modal-checklist">
                <li>Works with any personal WhatsApp number</li>
                <li>Uses the same WhatsApp Web protocol as WhatsApp Desktop</li>
                <li>Session stays active until you disconnect or log out</li>
              </ul>
              {error && <div className="error-banner">{error}</div>}
              <button className="btn-primary" onClick={startConnect}>
                Generate QR Code
              </button>
            </>
          )}

          {error && !isConnecting && state.status !== 'idle' && (
            <div className="error-banner">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
