import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';

const PLATFORM_ICONS = { gmail: '✉', whatsapp: '●', instagram: '◈' };

function ReplyCard({ item, onAction }) {
  const [editing,    setEditing]    = useState(false);
  const [editText,   setEditText]   = useState(item.suggested_reply);
  const [processing, setProcessing] = useState(false);

  async function act(fn) {
    setProcessing(true);
    try { await fn(); onAction(); }
    catch (err) { alert(err.message); setProcessing(false); }
  }

  return (
    <div className="reply-card">
      <div className="reply-card-header">
        <div className="reply-meta">
          <span className="platform-icon-sm">{PLATFORM_ICONS[item.platform] ?? '?'}</span>
          <span className="reply-from">{item.from_contact}</span>
        </div>
        <span className="reply-time">
          {new Date(item.created_at).toLocaleString()}
        </span>
      </div>

      <div className="reply-original">
        <span className="reply-label">Message</span>
        <p className="reply-body">{item.original_body}</p>
      </div>

      <div className="reply-suggestion">
        <span className="reply-label">AI suggestion</span>
        {editing ? (
          <textarea
            className="reply-edit-textarea"
            rows={4}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
        ) : (
          <p className="reply-body suggested">{item.suggested_reply}</p>
        )}
      </div>

      <div className="reply-actions">
        {!editing && (
          <>
            <button
              className="btn-primary"
              disabled={processing}
              onClick={() => act(() => api.approveReply(item.id))}
            >
              {processing ? '…' : 'Send'}
            </button>
            <button
              className="btn-secondary"
              disabled={processing}
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button
              className="btn-danger-sm"
              disabled={processing}
              onClick={() => act(() => api.rejectReply(item.id))}
            >
              Dismiss
            </button>
          </>
        )}
        {editing && (
          <>
            <button
              className="btn-primary"
              disabled={processing || !editText.trim()}
              onClick={() => act(() => api.editReply(item.id, editText))}
            >
              {processing ? '…' : 'Send edited'}
            </button>
            <button
              className="btn-secondary"
              disabled={processing}
              onClick={() => { setEditing(false); setEditText(item.suggested_reply); }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function PendingReplies() {
  const [replies,  setReplies]  = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.getPendingReplies()
      .then((res) => { setReplies(res.replies ?? []); setTotal(res.total ?? 0); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Pending Replies {total > 0 && <span className="badge-count">{total}</span>}</h2>
        <button className="btn-secondary" onClick={load}>Refresh</button>
      </div>

      {loading && <div className="loading">Loading…</div>}
      {error   && <div className="error-banner">{error}</div>}

      {!loading && replies.length === 0 && (
        <div className="empty-state">No pending replies. Enable suggest mode in Settings to review AI drafts before they're sent.</div>
      )}

      {!loading && replies.length > 0 && (
        <div className="reply-list">
          {replies.map((r) => (
            <ReplyCard key={r.id} item={r} onAction={load} />
          ))}
        </div>
      )}
    </div>
  );
}
