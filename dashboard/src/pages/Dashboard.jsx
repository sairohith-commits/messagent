import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../contexts/AuthContext.jsx';

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`stat-card${accent ? ' accent' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function PlatformBadge({ platform, enabled }) {
  const icons = { gmail: '✉', whatsapp: '●', instagram: '◈' };
  return (
    <span className={`platform-badge${enabled ? ' on' : ' off'}`}>
      {icons[platform] ?? '○'} {platform}
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [settings,     setSettings]     = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.getSettings(),
      api.getMessages(5),
      api.getSubscriptionStatus(),
    ]).then(([s, m, sub]) => {
      if (s.status === 'fulfilled') setSettings(s.value);
      if (m.status === 'fulfilled') setMessages(m.value.messages ?? m.value ?? []);
      if (sub.status === 'fulfilled') setSubscription(sub.value);
      setLoading(false);
    });
  }, []);

  const platforms     = settings?.platforms ?? [];
  const enabledCount  = platforms.filter((p) => p.enabled).length;
  const tier          = subscription?.tier ?? user?.tier ?? 'free';
  const isPro         = tier !== 'free';

  return (
    <div className="page">
      <div className="page-header">
        <h2>Dashboard</h2>
        <span className={`tier-badge ${isPro ? 'pro' : 'free'}`}>
          {tier.toUpperCase()}
        </span>
      </div>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard
              label="Active platforms"
              value={enabledCount}
              sub={`of ${platforms.length} connected`}
            />
            <StatCard
              label="Recent messages"
              value={messages.length}
              sub="last 5"
            />
            <StatCard
              label="Plan"
              value={tier.charAt(0).toUpperCase() + tier.slice(1)}
              sub={isPro ? 'Claude replies active' : 'Upgrade for Claude replies'}
              accent={isPro}
            />
          </div>

          <div className="section">
            <div className="section-header">
              <h3>Platform status</h3>
              <Link to="/settings" className="link-sm">Manage →</Link>
            </div>
            <div className="platform-row">
              {platforms.length === 0 ? (
                <p className="muted">No platforms configured yet. <Link to="/settings">Add one →</Link></p>
              ) : (
                platforms.map((p) => (
                  <PlatformBadge key={p.platform} platform={p.platform} enabled={p.enabled} />
                ))
              )}
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <h3>Recent messages</h3>
              <Link to="/messages" className="link-sm">View all →</Link>
            </div>
            {messages.length === 0 ? (
              <p className="muted">No messages yet — connect Gmail and send a test email.</p>
            ) : (
              <div className="message-list">
                {messages.map((msg) => (
                  <div key={msg.id} className="message-row">
                    <div className="msg-from">{msg.from_contact}</div>
                    <div className="msg-body">{(msg.body ?? '').slice(0, 80)}{msg.body?.length > 80 ? '…' : ''}</div>
                    <div className="msg-meta">
                      <span className={`status-dot ${msg.status}`} />
                      {msg.status} · {msg.platform} · {new Date(msg.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!isPro && (
            <div className="upgrade-banner">
              <div>
                <strong>Upgrade to Pro</strong>
                <p>Get Claude-powered smart replies, unlimited platforms, and priority processing.</p>
              </div>
              <Link to="/billing" className="btn-primary">Upgrade →</Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
