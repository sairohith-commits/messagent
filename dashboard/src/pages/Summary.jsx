import { useState, useEffect } from 'react';
import { api } from '../api.js';

const URGENCY_COLORS = {
  high:   { bg: '#fff5f5', border: '#fc8181', badge: '#e53e3e', label: 'High' },
  medium: { bg: '#fffaf0', border: '#fbd38d', badge: '#dd6b20', label: 'Medium' },
  low:    { bg: '#f0fff4', border: '#9ae6b4', badge: '#38a169', label: 'Low'  },
};

function SummaryCard({ item }) {
  const color = URGENCY_COLORS[item.urgency] ?? URGENCY_COLORS.low;

  return (
    <div
      className="summary-card"
      style={{ background: color.bg, borderLeft: `4px solid ${color.border}` }}
    >
      <div className="summary-card-header">
        <div>
          <span className="summary-from">{item.from}</span>
          <span className="summary-platform">{item.platform}</span>
        </div>
        <span
          className="urgency-badge"
          style={{ background: color.badge }}
        >
          {color.label}
        </span>
      </div>

      <p className="summary-text">{item.summary}</p>

      {item.suggestedReply && (
        <div className="summary-suggestion">
          <span className="suggestion-label">Suggested reply</span>
          <p className="suggestion-text">"{item.suggestedReply}"</p>
        </div>
      )}
    </div>
  );
}

export default function Summary() {
  const [summaries, setSummaries] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  useEffect(() => {
    api.getDailySummary()
      .then((res) => { setSummaries(res.summaries ?? []); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  const grouped = { high: [], medium: [], low: [] };
  for (const s of summaries) {
    (grouped[s.urgency] ?? grouped.low).push(s);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Daily Summary</h2>
        <button
          className="btn-secondary"
          onClick={() => {
            setLoading(true);
            api.getDailySummary()
              .then((res) => { setSummaries(res.summaries ?? []); setLoading(false); })
              .catch((err) => { setError(err.message); setLoading(false); });
          }}
        >
          Refresh
        </button>
      </div>

      {loading && <div className="loading">Generating AI summary…</div>}
      {error   && <div className="error-banner">{error}</div>}

      {!loading && summaries.length === 0 && (
        <div className="empty-state">No messages to summarize yet.</div>
      )}

      {!loading && summaries.length > 0 && (
        <div className="summary-groups">
          {['high', 'medium', 'low'].map((urgency) =>
            grouped[urgency].length > 0 && (
              <div key={urgency} className="summary-group">
                <h3 className="summary-group-title">
                  {URGENCY_COLORS[urgency].label} Priority ({grouped[urgency].length})
                </h3>
                <div className="summary-cards">
                  {grouped[urgency].map((item, i) => (
                    <SummaryCard key={i} item={item} />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
