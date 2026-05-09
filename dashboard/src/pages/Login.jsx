import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();

  const [mode,     setMode]     = useState('login'); // 'login' | 'register'
  const [email,    setEmail]    = useState('');
  const [name,     setName]     = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let res;
      if (mode === 'login') {
        res = await api.login(email, password);
      } else {
        res = await api.register(email, name, password);
      }
      login(res.token, res.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">✉</div>
          <h1>Messagent</h1>
          <p>AI-powered email auto-reply</p>
        </div>

        <div className="tab-row">
          <button
            className={`tab-btn${mode === 'login' ? ' active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >Sign in</button>
          <button
            className={`tab-btn${mode === 'register' ? ' active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
          >Create account</button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <div className="field">
              <label htmlFor="name">Full name</label>
              <input
                id="name"
                type="text"
                placeholder="Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder={mode === 'register' ? 'At least 8 characters' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          {error && <div className="error-banner">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
