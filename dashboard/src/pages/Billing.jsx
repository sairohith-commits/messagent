import { useState, useEffect } from 'react';
import { api } from '../api.js';

const PLANS = [
  {
    id:       'pro',
    name:     'Pro',
    price:    '$9 / month',
    features: [
      'Claude-powered smart replies',
      'All platforms (Gmail, WhatsApp, Instagram)',
      'Owner + assistant reply modes',
      'Custom instructions',
      'Scheduling (active hours)',
      'Priority processing',
    ],
  },
  {
    id:       'business',
    name:     'Business',
    price:    '$29 / month',
    features: [
      'Everything in Pro',
      'Multiple Gmail accounts',
      'Team member seats',
      'Analytics & reporting',
      'Dedicated support',
    ],
  },
];

function PlanCard({ plan, currentTier, onUpgrade, loading }) {
  const isCurrent = currentTier === plan.id;
  return (
    <div className={`plan-card${isCurrent ? ' current' : ''}`}>
      {isCurrent && <div className="plan-badge">Current plan</div>}
      <div className="plan-name">{plan.name}</div>
      <div className="plan-price">{plan.price}</div>
      <ul className="plan-features">
        {plan.features.map((f) => <li key={f}>✓ {f}</li>)}
      </ul>
      {!isCurrent && (
        <button
          className="btn-primary"
          onClick={() => onUpgrade(plan.id)}
          disabled={loading}
        >
          {loading ? 'Redirecting…' : `Upgrade to ${plan.name}`}
        </button>
      )}
    </div>
  );
}

export default function Billing() {
  const [subscription, setSubscription] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [upgrading,    setUpgrading]    = useState(false);
  const [cancelling,   setCancelling]   = useState(false);
  const [error,        setError]        = useState('');
  const [notice,       setNotice]       = useState('');

  useEffect(() => {
    api.getSubscriptionStatus()
      .then((res) => { setSubscription(res); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });

    // Handle return from Stripe checkout
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true')  setNotice('🎉 Subscription activated! You are now on Pro.');
    if (params.get('canceled') === 'true') setNotice('Checkout was cancelled — you have not been charged.');
  }, []);

  async function handleUpgrade(plan) {
    setError('');
    setUpgrading(true);
    try {
      const { url } = await api.createCheckout(plan);
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setUpgrading(false);
    }
  }

  async function handleCancel() {
    if (!confirm('Cancel your subscription? You will keep access until the end of the billing period.')) return;
    setCancelling(true);
    setError('');
    try {
      await api.cancelSubscription();
      setNotice('Subscription will cancel at end of billing period.');
      const res = await api.getSubscriptionStatus();
      setSubscription(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  const tier       = subscription?.tier ?? 'free';
  const periodEnd  = subscription?.subscription_period_end;
  const isPro      = tier !== 'free';

  return (
    <div className="page">
      <div className="page-header">
        <h2>Billing</h2>
      </div>

      {loading && <div className="loading">Loading billing info…</div>}
      {error   && <div className="error-banner">{error}</div>}
      {notice  && <div className="notice-banner">{notice}</div>}

      {!loading && (
        <>
          <div className="billing-status">
            <div className="billing-status-row">
              <span className="billing-label">Current plan</span>
              <span className={`tier-badge ${isPro ? 'pro' : 'free'}`}>
                {tier.toUpperCase()}
              </span>
            </div>
            {isPro && periodEnd && (
              <div className="billing-status-row">
                <span className="billing-label">Renews</span>
                <span>{new Date(periodEnd).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          <div className="plans-grid">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                currentTier={tier}
                onUpgrade={handleUpgrade}
                loading={upgrading}
              />
            ))}
          </div>

          {isPro && (
            <div className="cancel-section">
              <h3>Cancel subscription</h3>
              <p>Your access continues until the end of the current billing period.</p>
              <button
                className="btn-danger"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling…' : 'Cancel subscription'}
              </button>
            </div>
          )}

          {!isPro && (
            <div className="free-note">
              <strong>Free plan limits:</strong> Replies use the Gemma placeholder.
              Upgrade to Pro to enable Claude-powered smart replies.
            </div>
          )}
        </>
      )}
    </div>
  );
}
