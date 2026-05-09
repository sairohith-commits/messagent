import { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function InstagramLogin({ onConnected, onClose }) {
  const [step,     setStep]     = useState('idle');  // idle | form | challenge | success
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code,     setCode]     = useState('');
  const [cType,    setCType]    = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    // Check if already connected
    api.igPersonalStatus().then((s) => {
      if (s.status === 'connected') {
        setStep('success');
        onConnected?.(s.username);
      } else if (s.status === 'challenge_required') {
        setStep('challenge');
      } else {
        setStep('form');
      }
    }).catch(() => setStep('form'));
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.igPersonalConnect(username, password);
      if (res.success) {
        setStep('success');
        onConnected?.(username);
      } else if (res.needsChallenge) {
        setCType(res.challengeType ?? 'code');
        setStep('challenge');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.igPersonalVerifyChallenge(code);
      setStep('success');
      onConnected?.(username);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Connect Instagram</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {step === 'form' && (
            <form onSubmit={handleLogin}>
              <p className="modal-instruction">
                Enter your Instagram credentials. Messagent uses these to read
                and auto-reply to your DMs. Credentials are never stored — only
                the session cookie (expires in 30 days).
              </p>
              <div className="field">
                <label>Instagram username</label>
                <input
                  type="text"
                  placeholder="@yourhandle"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/^@/, ''))}
                  required
                />
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <div className="error-banner" style={{ marginTop: 12 }}>{error}</div>}
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
                style={{ marginTop: 16 }}
              >
                {loading ? 'Signing in…' : 'Sign in to Instagram'}
              </button>
            </form>
          )}

          {step === 'challenge' && (
            <form onSubmit={handleVerify}>
              <p className="modal-instruction">
                Instagram requires verification. Enter the{' '}
                {cType.includes('email') ? 'email' : 'SMS'} code sent to your account.
              </p>
              <div className="field">
                <label>Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              {error && <div className="error-banner" style={{ marginTop: 12 }}>{error}</div>}
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
                style={{ marginTop: 16 }}
              >
                {loading ? 'Verifying…' : 'Verify'}
              </button>
            </form>
          )}

          {step === 'success' && (
            <div className="connect-success">
              <div className="connect-icon">✓</div>
              <strong>Connected!</strong>
              <p>Instagram DMs are being monitored for @{username || 'your account'}.</p>
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
