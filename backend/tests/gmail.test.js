// Gmail service unit tests — webhook processing and message filtering logic

'use strict';

// googleapis is mocked in tests/setup.js
const { query } = require('../src/db');

// Import after mocks are in place
const {
  processGmailWebhook,
} = require('../src/services/gmail');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a base64-encoded Pub/Sub message payload as Google sends it.
 */
function makePubSubPayload(emailAddress, historyId) {
  const data = Buffer.from(JSON.stringify({ emailAddress, historyId })).toString('base64');
  return { message: { data, messageId: 'msg-1', publishTime: new Date().toISOString() } };
}

// ─── processGmailWebhook ──────────────────────────────────────────────────────

describe('processGmailWebhook', () => {
  it('does nothing when payload has no message.data', async () => {
    await expect(processGmailWebhook({})).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });

  it('does nothing when no user is found for the email address', async () => {
    // DB returns no user for the email
    query.mockResolvedValueOnce({ rows: [] });

    const payload = makePubSubPayload('unknown@gmail.com', '99999');
    await processGmailWebhook(payload);

    // Only one query — the user lookup — should have been made
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('saves cursor on first notification (no lastHistoryId)', async () => {
    // User found but with no existing history cursor
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 'uuid-1', gmail_history_id: null }] })  // lookup
      .mockResolvedValueOnce({ rows: [] });  // updateHistoryId

    const payload = makePubSubPayload('user@gmail.com', '55555');
    await processGmailWebhook(payload);

    // Second call should be the UPDATE to save the new historyId
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toMatch(/UPDATE platform_tokens/i);
  });

  it('fetches Gmail history when a cursor already exists', async () => {
    // User has an existing cursor — trigger the history.list path
    query
      .mockResolvedValueOnce({ rows: [{ user_id: 'uuid-1', gmail_history_id: '10000' }] })  // lookup
      .mockResolvedValueOnce({ rows: [{ access_token: 'mock-token', expires_at: new Date(Date.now() + 3600000), refresh_token: 'rt' }] })  // getToken
      .mockResolvedValueOnce({ rows: [] });  // updateHistoryId

    // googleapis mock returns empty history — no messages to process
    const payload = makePubSubPayload('user@gmail.com', '10001');
    await processGmailWebhook(payload);

    // Should have advanced the cursor
    const lastCall = query.mock.calls[query.mock.calls.length - 1];
    expect(lastCall[0]).toMatch(/UPDATE platform_tokens/i);
    expect(lastCall[1]).toContain('10001'); // new historyId saved
  });
});

// ─── Self-send and user-started thread filtering ──────────────────────────────

describe('Gmail message filtering via processGmailWebhook', () => {
  const { google } = require('googleapis');

  it('skips messages that are sent by the user themselves', async () => {
    // Simulate a history item pointing to a self-sent message
    const mockGmailInstance = google.gmail();

    // Override messages.get to return a self-sent "From" header
    mockGmailInstance.users.messages.get.mockResolvedValueOnce({
      data: {
        payload: {
          headers: [
            { name: 'From', value: 'user@gmail.com' },  // same as userEmail
            { name: 'Subject', value: 'Test' },
          ],
          mimeType: 'text/plain',
          body: { data: Buffer.from('hello').toString('base64url') },
        },
      },
    });

    query
      .mockResolvedValueOnce({ rows: [{ user_id: 'uuid-1', gmail_history_id: '10000' }] })
      .mockResolvedValueOnce({ rows: [{ access_token: 'mock-token', expires_at: new Date(Date.now() + 3600000), refresh_token: 'rt' }] })
      .mockResolvedValueOnce({ rows: [] }); // updateHistoryId

    // Inject a history item with one message
    const { google: g } = require('googleapis');
    g.gmail().users.history.list.mockResolvedValueOnce({
      data: {
        history: [{
          messagesAdded: [{ message: { id: 'msg-1', threadId: 'thread-1' } }],
        }],
      },
    });
    g.gmail().users.messages.get.mockResolvedValueOnce({
      data: {
        payload: {
          headers: [{ name: 'From', value: 'user@gmail.com' }],
          mimeType: 'text/plain', body: { data: '' },
        },
      },
    });

    const payload = makePubSubPayload('user@gmail.com', '10001');
    await processGmailWebhook(payload);

    // saveMessage should NOT have been called since the message is self-sent
    const saveMessageCalls = query.mock.calls.filter((c) => c[0]?.includes?.('INSERT INTO messages'));
    expect(saveMessageCalls).toHaveLength(0);
  });
});
