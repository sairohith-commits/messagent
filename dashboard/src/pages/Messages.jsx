import { useState, useEffect } from 'react';
import { api } from '../api.js';

const STATUS_LABELS = {
  pending:   { label: 'Pending',   cls: 'status-pending'   },
  replied:   { label: 'Replied',   cls: 'status-replied'   },
  skipped:   { label: 'Skipped',   cls: 'status-skipped'   },
  failed:    { label: 'Failed',    cls: 'status-failed'    },
  processing:{ label: 'Processing',cls: 'status-processing'},
};

const PLATFORM_ICONS = { gmail: '✉', whatsapp: '●', instagram: '◈' };

function StatusPill({ status }) {
  const { label, cls } = STATUS_LABELS[status] ?? { label: status, cls: '' };
  return <span className={`status-pill ${cls}`}>{label}</span>;
}

export default function Messages() {
  const [messages, setMessages] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [filter,   setFilter]   = useState('all');

  useEffect(() => {
    api.getMessages(100)
      .then((res) => {
        setMessages(res.messages ?? res ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const displayed = filter === 'all'
    ? messages
    : messages.filter((m) => m.status === filter);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Messages</h2>
        <div className="filter-row">
          {['all', 'replied', 'pending', 'skipped', 'failed'].map((f) => (
            <button
              key={f}
              className={`filter-btn${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="loading">Loading messages…</div>}
      {error   && <div className="error-banner">{error}</div>}

      {!loading && !error && (
        <>
          <div className="table-meta">{displayed.length} message{displayed.length !== 1 ? 's' : ''}</div>

          {displayed.length === 0 ? (
            <p className="muted">No messages match this filter.</p>
          ) : (
            <div className="msg-table-wrap">
              <table className="msg-table">
                <thead>
                  <tr>
                    <th>From</th>
                    <th>Platform</th>
                    <th>Message</th>
                    <th>Status</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((msg) => (
                    <tr key={msg.id}>
                      <td className="td-from">{msg.from_contact}</td>
                      <td>
                        <span className="platform-icon" title={msg.platform}>
                          {PLATFORM_ICONS[msg.platform] ?? msg.platform}
                        </span>
                      </td>
                      <td className="td-body">
                        {(msg.body ?? '').slice(0, 120)}{msg.body?.length > 120 ? '…' : ''}
                      </td>
                      <td><StatusPill status={msg.status} /></td>
                      <td className="td-date">{new Date(msg.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
