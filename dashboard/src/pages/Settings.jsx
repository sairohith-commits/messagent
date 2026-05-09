import { useState, useEffect } from 'react';
import { api } from '../api.js';
import WhatsAppQR      from '../components/WhatsAppQR.jsx';
import InstagramLogin  from '../components/InstagramLogin.jsx';

const PLATFORMS = ['gmail', 'whatsapp', 'instagram'];

const DEFAULT_PLATFORM = {
  platform:          '',
  enabled:           false,
  mode:              'assistant',
  replyMode:         'auto',
  schedule_start:    null,
  schedule_end:      null,
  user_instructions: '',
};

const PLATFORM_ICONS = { gmail: '✉', whatsapp: '●', instagram: '◈' };

// ─── Connection status for personal platforms ──────────────────────────────

function ConnectSection({ platform, onConnected, onDisconnected }) {
  const [status,   setStatus]   = useState(null); // null = loading
  const [showWA,   setShowWA]   = useState(false);
  const [showIG,   setShowIG]   = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, [platform]);

  async function fetchStatus() {
    setStatus(null);
    try {
      if (platform === 'whatsapp')  { const s = await api.waStatus();          setStatus(s); }
      if (platform === 'instagram') { const s = await api.igPersonalStatus();  setStatus(s); }
    } catch {
      setStatus({ status: 'disconnected' });
    }
  }

  async function handleDisconnect() {
    setRemoving(true);
    try {
      if (platform === 'whatsapp')  await api.waDisconnect();
      if (platform === 'instagram') await api.igPersonalDisconnect();
      await fetchStatus();
      onDisconnected?.();
    } finally {
      setRemoving(false);
    }
  }

  if (platform === 'gmail') {
    return null; // Gmail uses OAuth — connection shown in Dashboard
  }

  const connected = status?.status === 'connected';
  const label     = platform === 'whatsapp' ? `+${status?.phoneNumber}` : `@${status?.username}`;

  return (
    <div className="connect-section">
      {status === null && <span className="muted">Checking…</span>}

      {status !== null && connected && (
        <div className="connect-row">
          <span className="connect-active">● {label} connected</span>
          <button
            className="btn-danger-sm"
            onClick={handleDisconnect}
            disabled={removing}
          >
            {removing ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      )}

      {status !== null && !connected && (
        <button
          className="btn-connect"
          onClick={() => platform === 'whatsapp' ? setShowWA(true) : setShowIG(true)}
        >
          {platform === 'whatsapp' ? '▷ Scan QR to connect' : '▷ Sign in to Instagram'}
        </button>
      )}

      {showWA && (
        <WhatsAppQR
          onConnected={(phone) => { fetchStatus(); setShowWA(false); onConnected?.(phone); }}
          onClose={() => setShowWA(false)}
        />
      )}
      {showIG && (
        <InstagramLogin
          onConnected={(user) => { fetchStatus(); setShowIG(false); onConnected?.(user); }}
          onClose={() => setShowIG(false)}
        />
      )}
    </div>
  );
}

// ─── Per-platform settings card ────────────────────────────────────────────

function PlatformSection({ cfg, onChange }) {
  const update = (key, value) => onChange({ ...cfg, [key]: value });

  return (
    <div className={`platform-section${cfg.enabled ? ' enabled' : ''}`}>
      <div className="platform-section-header">
        <div className="platform-title">
          <span className="platform-icon-lg">{PLATFORM_ICONS[cfg.platform]}</span>
          <span className="platform-name">{cfg.platform}</span>
          {cfg.enabled && <span className="badge-on">Active</span>}
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
          />
          <span className="toggle-track" />
        </label>
      </div>

      <ConnectSection
        platform={cfg.platform}
        onConnected={() => !cfg.enabled && update('enabled', true)}
        onDisconnected={() => update('enabled', false)}
      />

      {cfg.enabled && (
        <div className="platform-body">
          <div className="field-row two-col">
            <div className="field">
              <label>Reply mode</label>
              <select value={cfg.mode} onChange={(e) => update('mode', e.target.value)}>
                <option value="assistant">Assistant — transparent AI</option>
                <option value="owner">Owner — replies as you</option>
              </select>
            </div>
            <div className="field">
              <label>Dispatch mode</label>
              <select value={cfg.replyMode ?? 'auto'} onChange={(e) => update('replyMode', e.target.value)}>
                <option value="auto">Auto — send immediately</option>
                <option value="suggest">Suggest — review before sending</option>
              </select>
            </div>
          </div>

          <div className="field-row two-col">
            <div className="field">
              <label>Active from (UTC)</label>
              <input
                type="time"
                value={cfg.schedule_start ?? ''}
                onChange={(e) => update('schedule_start', e.target.value || null)}
              />
            </div>
            <div className="field">
              <label>Active until (UTC)</label>
              <input
                type="time"
                value={cfg.schedule_end ?? ''}
                onChange={(e) => update('schedule_end', e.target.value || null)}
              />
            </div>
          </div>
          <p className="field-hint">Leave blank to reply 24 / 7.</p>

          <div className="field">
            <label>
              Custom instructions <span className="field-optional">(optional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Keep replies under 3 sentences. If asked about pricing, redirect to my website."
              value={cfg.user_instructions ?? ''}
              onChange={(e) => update('user_instructions', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Settings() {
  const [platforms, setPlatforms] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    api.getSettings()
      .then((res) => {
        const existing = res.platforms ?? [];
        const merged = PLATFORMS.map((p) => {
          const found = existing.find((e) => e.platform === p);
          return found ?? { ...DEFAULT_PLATFORM, platform: p };
        });
        setPlatforms(merged);
        setLoading(false);
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  function handleChange(idx, updated) {
    setPlatforms((prev) => prev.map((p, i) => (i === idx ? updated : p)));
    setSaved(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.updateSettings({ platforms });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      {loading && <div className="loading">Loading settings…</div>}
      {error   && <div className="error-banner">{error}</div>}

      {!loading && (
        <form onSubmit={handleSave}>
          <div className="settings-platforms">
            {platforms.map((cfg, i) => (
              <PlatformSection
                key={cfg.platform}
                cfg={cfg}
                onChange={(updated) => handleChange(i, updated)}
              />
            ))}
          </div>

          <div className="save-row">
            {saved && <span className="save-notice">✓ Settings saved</span>}
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
