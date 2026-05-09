// Full-screen plan comparison and upgrade screen

import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { COLORS } from '../constants/theme';
import { startCheckout } from '../services/subscriptionService';

// ─── Plan definitions ─────────────────────────────────────────────────────────

const PLANS = [
  {
    id:       'free',
    label:    'Free',
    price:    '$0',
    period:   'forever',
    color:    '#555',
    features: [
      { text: 'Gemma on-device AI',        included: true  },
      { text: '1 connected platform',      included: true  },
      { text: '50 replies / month',        included: true  },
      { text: 'Claude Sonnet replies',     included: false },
      { text: 'Unlimited platforms',       included: false },
      { text: 'Auto-send (no review)',     included: false },
      { text: 'CRM sync',                  included: false },
      { text: 'Multi-user workspace',      included: false },
      { text: 'Analytics dashboard',       included: false },
    ],
  },
  {
    id:       'pro',
    label:    'Pro',
    price:    '$9',
    period:   'per month',
    color:    COLORS.accent,
    popular:  true,
    features: [
      { text: 'Gemma on-device AI',        included: true  },
      { text: '1 connected platform',      included: true  },
      { text: '50 replies / month',        included: true  },
      { text: 'Claude Sonnet replies',     included: true  },
      { text: 'Unlimited platforms',       included: true  },
      { text: 'Auto-send (no review)',     included: true  },
      { text: 'CRM sync',                  included: false },
      { text: 'Multi-user workspace',      included: false },
      { text: 'Analytics dashboard',       included: false },
    ],
  },
  {
    id:       'business',
    label:    'Business',
    price:    '$29',
    period:   'per month',
    color:    COLORS.success,
    features: [
      { text: 'Gemma on-device AI',        included: true  },
      { text: '1 connected platform',      included: true  },
      { text: '50 replies / month',        included: true  },
      { text: 'Claude Sonnet replies',     included: true  },
      { text: 'Unlimited platforms',       included: true  },
      { text: 'Auto-send (no review)',     included: true  },
      { text: 'CRM sync',                  included: true  },
      { text: 'Multi-user workspace',      included: true  },
      { text: 'Analytics dashboard',       included: true  },
    ],
  },
];

export default function Upgrade({ route }) {
  // currentTier can be passed via navigation params or defaults to 'free'
  const currentTier = route?.params?.currentTier ?? 'free';
  const [loading, setLoading]   = useState(null); // plan id being loaded

  async function handleUpgrade(planId) {
    if (planId === currentTier || planId === 'free') return;

    setLoading(planId);
    try {
      await startCheckout(planId);
      // The subscription status will be updated by the Stripe webhook.
      // The user sees the new tier after the next Settings screen load.
      Alert.alert(
        'Payment started',
        'Complete the checkout in the browser. Your plan updates automatically on success.',
        [{ text: 'OK' }],
      );
    } catch (err) {
      Alert.alert('Error', err.message ?? 'Could not start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <Text style={styles.heading}>Choose your plan</Text>
        <Text style={styles.subheading}>
          Upgrade anytime. Cancel at the end of your billing period.
        </Text>

        {/* ── Plan cards ─────────────────────────────────────────────────── */}
        {PLANS.map((plan) => {
          const isCurrent  = plan.id === currentTier;
          const isUpgrade  = plan.id !== 'free' && plan.id !== currentTier;
          const isLoading  = loading === plan.id;

          return (
            <View
              key={plan.id}
              style={[
                styles.planCard,
                isCurrent && styles.planCardCurrent,
                plan.popular && styles.planCardPopular,
                { borderColor: isCurrent ? plan.color : COLORS.cardBorder },
              ]}
            >
              {/* Popular badge */}
              {plan.popular && !isCurrent && (
                <View style={[styles.popularBadge, { backgroundColor: plan.color }]}>
                  <Text style={styles.popularBadgeTxt}>Most Popular</Text>
                </View>
              )}

              {/* Plan header */}
              <View style={styles.planHeader}>
                <Text style={[styles.planLabel, { color: plan.color }]}>{plan.label}</Text>
                <View style={styles.priceRow}>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                  <Text style={styles.planPeriod}> /{plan.period}</Text>
                </View>
                {isCurrent && (
                  <View style={[styles.currentBadge, { backgroundColor: plan.color + '22' }]}>
                    <Text style={[styles.currentBadgeTxt, { color: plan.color }]}>Current plan</Text>
                  </View>
                )}
              </View>

              {/* Feature list */}
              <View style={styles.featureList}>
                {plan.features.map((f, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Text style={[styles.featureCheck, f.included ? styles.featureCheckOn : styles.featureCheckOff]}>
                      {f.included ? '✓' : '✗'}
                    </Text>
                    <Text style={[styles.featureTxt, !f.included && styles.featureTxtOff]}>
                      {f.text}
                    </Text>
                  </View>
                ))}
              </View>

              {/* CTA button */}
              {isUpgrade && (
                <Pressable
                  style={({ pressed }) => [
                    styles.upgradeBtn,
                    { backgroundColor: plan.color },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => handleUpgrade(plan.id)}
                  disabled={isLoading}
                >
                  {isLoading
                    ? <ActivityIndicator color="#FFF" size="small" />
                    : <Text style={styles.upgradeBtnTxt}>Upgrade to {plan.label}</Text>
                  }
                </Pressable>
              )}
            </View>
          );
        })}

        <Text style={styles.footer}>
          Prices in USD. Cancel anytime from Settings. No refunds for partial periods.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.background },
  container: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 48 },

  heading: {
    fontSize: 26, fontWeight: '800', color: COLORS.text,
    letterSpacing: -0.5, marginBottom: 8,
  },
  subheading: {
    fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 28,
  },

  planCard: {
    backgroundColor: COLORS.card, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    padding: 20, marginBottom: 16, overflow: 'hidden',
  },
  planCardCurrent: {
    borderWidth: 2,
  },
  planCardPopular: {
    marginTop: 4,
  },

  popularBadge: {
    position: 'absolute', top: 0, right: 0,
    borderBottomLeftRadius: 12,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  popularBadgeTxt: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  planHeader:  { marginBottom: 18 },
  planLabel:   { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  priceRow:    { flexDirection: 'row', alignItems: 'baseline' },
  planPrice:   { fontSize: 32, fontWeight: '800', color: COLORS.text },
  planPeriod:  { fontSize: 14, color: COLORS.textSecondary },

  currentBadge: {
    alignSelf: 'flex-start', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 8,
  },
  currentBadgeTxt: { fontSize: 12, fontWeight: '600' },

  featureList: { gap: 10, marginBottom: 20 },
  featureRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureCheck:    { fontSize: 14, fontWeight: '700', width: 16, textAlign: 'center' },
  featureCheckOn:  { color: COLORS.success },
  featureCheckOff: { color: COLORS.error },
  featureTxt:    { fontSize: 14, color: COLORS.text, flex: 1 },
  featureTxtOff: { color: COLORS.textSecondary },

  upgradeBtn: {
    borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  upgradeBtnTxt: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  footer: {
    fontSize: 12, color: COLORS.textSecondary,
    textAlign: 'center', marginTop: 8, lineHeight: 18,
  },
});
