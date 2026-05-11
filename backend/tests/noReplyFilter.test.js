'use strict';

// Unit tests for shouldSkipEmail — the automated-sender filter in gmail.js.
// These run without any real DB/Redis/Gmail connections.

// ─── Inline the filter so tests don't depend on gmail.js module loading ───────

const SKIP_FROM_PATTERNS = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'mailer-daemon', 'postmaster', 'automated', 'auto-confirm',
  'notifications', 'bounce', 'no.reply', 'do.not.reply',
];

const SKIP_DOMAINS = [
  'mailchimp.com', 'sendgrid.net', 'amazonses.com', 'exacttarget.com',
  'marketo.com', 'hubspot.com', 'klaviyo.com', 'constantcontact.com',
  'mailgun.org', 'sparkpost.com', 'postmarkapp.com', 'mandrill.com',
];

const SKIP_SUBJECT_PREFIXES = [
  'auto:', 'auto-reply', 'automated reply', 'automated response',
  '[automated]', 'out of office', 'delivery status', 'delivery failure',
  'mail delivery', 'returned mail', 'undeliverable', 'undelivered mail',
  'mailer-daemon', 'failure notice', 'delivery notification',
];

function getHeader(headers = [], name) {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function shouldSkipEmail(fromEmail, subject, headers, userEmail) {
  const emailLower   = fromEmail.toLowerCase();
  const subjectLower = (subject ?? '').toLowerCase();

  if (SKIP_FROM_PATTERNS.some((p) => emailLower.includes(p))) return true;

  const domain = emailLower.split('@')[1] ?? '';
  if (SKIP_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;

  if (SKIP_SUBJECT_PREFIXES.some((p) => subjectLower.startsWith(p))) return true;

  const autoSubmitted  = getHeader(headers, 'Auto-Submitted').toLowerCase();
  const xAutoSubmitted = getHeader(headers, 'X-Auto-Submitted').toLowerCase();
  const autoReply      = getHeader(headers, 'X-Autoreply').toLowerCase();
  const xAutorespond   = getHeader(headers, 'X-Autorespond').toLowerCase();
  const precedence     = getHeader(headers, 'Precedence').toLowerCase();

  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (xAutoSubmitted && xAutoSubmitted !== 'no') return true;
  if (autoReply === 'yes') return true;
  if (xAutorespond) return true;
  if (['bulk', 'list', 'junk', 'auto_reply'].includes(precedence)) return true;

  if (userEmail && emailLower.includes(userEmail.toLowerCase())) return true;

  return false;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const NO_HEADERS = [];
const USER_EMAIL = 'myemail@gmail.com';

describe('shouldSkipEmail — From address patterns', () => {
  test.each([
    'noreply@company.com',
    'no-reply@company.com',
    'no.reply@company.com',
    'donotreply@company.com',
    'do-not-reply@company.com',
    'mailer-daemon@example.com',
    'postmaster@example.com',
    'automated@company.com',
    'auto-confirm@shop.com',
    'bounce+abc123@example.com',
    'notifications@github.com',
  ])('skips %s', (from) => {
    expect(shouldSkipEmail(from, 'Hello', NO_HEADERS, USER_EMAIL)).toBe(true);
  });

  test('allows real human senders', () => {
    expect(shouldSkipEmail('john@example.com', 'Hello', NO_HEADERS, USER_EMAIL)).toBe(false);
    expect(shouldSkipEmail('alice.smith@gmail.com', 'Re: Meeting', NO_HEADERS, USER_EMAIL)).toBe(false);
  });

  test('is case-insensitive', () => {
    expect(shouldSkipEmail('NoReply@Company.COM', 'Hi', NO_HEADERS, USER_EMAIL)).toBe(true);
    expect(shouldSkipEmail('MAILER-DAEMON@example.com', 'Hi', NO_HEADERS, USER_EMAIL)).toBe(true);
  });
});

describe('shouldSkipEmail — bulk-mail domains', () => {
  test.each([
    'campaign@mailchimp.com',
    'email@sendgrid.net',
    'bounce@amazonses.com',
    'mail@klaviyo.com',
    'news@sub.mailchimp.com',   // subdomain
  ])('skips %s', (from) => {
    expect(shouldSkipEmail(from, 'Newsletter', NO_HEADERS, USER_EMAIL)).toBe(true);
  });

  test('allows domains that merely contain a bulk-mail substring', () => {
    // 'mymarketo.com' should NOT match 'marketo.com'
    expect(shouldSkipEmail('user@mymarketo.com', 'Hi', NO_HEADERS, USER_EMAIL)).toBe(false);
  });
});

describe('shouldSkipEmail — subject-line prefixes', () => {
  test.each([
    ['auto: out of office', 'skips "auto:" prefix'],
    ['Auto-reply: I am away', 'skips "auto-reply" (case-insensitive)'],
    ['Automated reply to your message', 'skips "automated reply"'],
    ['Out of office: back Monday', 'skips "out of office"'],
    ['Delivery Status Notification', 'skips "delivery status"'],
    ['Undeliverable: Your message', 'skips "undeliverable"'],
    ['Mail Delivery Failed', 'skips "mail delivery"'],
    ['Failure Notice', 'skips "failure notice"'],
    ['Delivery Notification: success', 'skips "delivery notification"'],
    ['[Automated] system alert', 'skips "[automated]"'],
  ])('%s — %s', (subject) => {
    expect(shouldSkipEmail('real@example.com', subject, NO_HEADERS, USER_EMAIL)).toBe(true);
  });

  test('does not skip normal subjects', () => {
    expect(shouldSkipEmail('bob@example.com', 'Quick question', NO_HEADERS, USER_EMAIL)).toBe(false);
    expect(shouldSkipEmail('bob@example.com', 'Re: Our meeting tomorrow', NO_HEADERS, USER_EMAIL)).toBe(false);
  });
});

describe('shouldSkipEmail — automation headers', () => {
  test('skips Auto-Submitted: auto-generated', () => {
    const headers = [{ name: 'Auto-Submitted', value: 'auto-generated' }];
    expect(shouldSkipEmail('bot@example.com', 'Hello', headers, USER_EMAIL)).toBe(true);
  });

  test('skips Auto-Submitted: auto-replied', () => {
    const headers = [{ name: 'Auto-Submitted', value: 'auto-replied' }];
    expect(shouldSkipEmail('bot@example.com', 'Hello', headers, USER_EMAIL)).toBe(true);
  });

  test('allows Auto-Submitted: no (explicitly human)', () => {
    const headers = [{ name: 'Auto-Submitted', value: 'no' }];
    expect(shouldSkipEmail('real@example.com', 'Hello', headers, USER_EMAIL)).toBe(false);
  });

  test('skips X-Auto-Submitted: auto-generated', () => {
    const headers = [{ name: 'X-Auto-Submitted', value: 'auto-generated' }];
    expect(shouldSkipEmail('bot@example.com', 'Hello', headers, USER_EMAIL)).toBe(true);
  });

  test('skips X-Autoreply: yes', () => {
    const headers = [{ name: 'X-Autoreply', value: 'yes' }];
    expect(shouldSkipEmail('bot@example.com', 'Hello', headers, USER_EMAIL)).toBe(true);
  });

  test('skips any X-Autorespond header', () => {
    const headers = [{ name: 'X-Autorespond', value: 'OOF' }];
    expect(shouldSkipEmail('bot@example.com', 'Hello', headers, USER_EMAIL)).toBe(true);
  });

  test.each(['bulk', 'list', 'junk', 'auto_reply'])('skips Precedence: %s', (precedence) => {
    const headers = [{ name: 'Precedence', value: precedence }];
    expect(shouldSkipEmail('news@example.com', 'Newsletter', headers, USER_EMAIL)).toBe(true);
  });

  test('allows Precedence: first-class', () => {
    const headers = [{ name: 'Precedence', value: 'first-class' }];
    expect(shouldSkipEmail('real@example.com', 'Hello', headers, USER_EMAIL)).toBe(false);
  });
});

describe('shouldSkipEmail — self-send / loop prevention', () => {
  test('skips email from the user themselves', () => {
    expect(shouldSkipEmail(USER_EMAIL, 'Test', NO_HEADERS, USER_EMAIL)).toBe(true);
  });

  test('skips with different casing', () => {
    expect(shouldSkipEmail('MyEmail@GMAIL.COM', 'Test', NO_HEADERS, USER_EMAIL)).toBe(true);
  });

  test('does not skip a different user with a similar address', () => {
    expect(shouldSkipEmail('myemail2@gmail.com', 'Test', NO_HEADERS, USER_EMAIL)).toBe(false);
  });
});

describe('truncateAtSentence', () => {
  // Inline the same logic from replyWorker.js
  function truncateAtSentence(text, maxChars = 500) {
    if (text.length <= maxChars) return text;
    const cut = text.slice(0, maxChars);
    const lastBoundary = Math.max(
      cut.lastIndexOf('. '),
      cut.lastIndexOf('! '),
      cut.lastIndexOf('? '),
      cut.lastIndexOf('.\n'),
    );
    if (lastBoundary > maxChars * 0.5) {
      return cut.slice(0, lastBoundary + 1).trim();
    }
    return cut.trimEnd() + '…';
  }

  test('does not modify text within limit', () => {
    const short = 'Hello! How are you?';
    expect(truncateAtSentence(short, 500)).toBe(short);
  });

  test('truncates at sentence boundary', () => {
    // The boundary ". " at index 43 is well past maxChars*0.5 (= 50), so it truncates there.
    const text = 'First sentence that is long enough. Second sentence goes here and keeps going past limit.';
    const result = truncateAtSentence(text, 100);
    expect(result).toBe('First sentence that is long enough. Second sentence goes here and keeps going past limit.');

    // With maxChars=50: cuts at index 50 → "First sentence that is long enough. Second senten"
    // boundary ". " at 35 > 50*0.5=25 → truncates at 35
    const result2 = truncateAtSentence(text, 50);
    expect(result2).toBe('First sentence that is long enough.');
    expect(result2.length).toBeLessThanOrEqual(50);
  });

  test('falls back to ellipsis when no sentence boundary in second half', () => {
    const text = 'A'.repeat(600);
    const result = truncateAtSentence(text, 500);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(501); // 500 chars + ellipsis char
  });

  test('preserves text that ends exactly at the limit', () => {
    const text = 'A'.repeat(500);
    expect(truncateAtSentence(text, 500)).toBe(text);
  });
});
