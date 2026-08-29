export const DEFAULT_PAYMENT_PLANS = Object.freeze([
  Object.freeze({ amount: 20, days: 1 }),
  Object.freeze({ amount: 40, days: 2 }),
  Object.freeze({ amount: 60, days: 3 }),
  Object.freeze({ amount: 120, days: 7 }),
  Object.freeze({ amount: 380, days: 30 })
]);

function clonePlans(plans) {
  return plans.map(({ amount, days }) => ({ amount: Number(amount), days: Number(days) }));
}

export function normalizePaymentPlans(value, fallback = DEFAULT_PAYMENT_PLANS) {
  if (!Array.isArray(value)) return clonePlans(fallback);
  const plans = value.slice(0, 10).map((item) => ({
    amount: Number(item?.amount),
    days: Number(item?.days)
  }));
  const valid = plans.length >= 1
    && plans.every(({ amount, days }) => (
      Number.isInteger(amount) && amount >= 1 && amount <= 100000
      && Number.isInteger(days) && days >= 1 && days <= 365
    ))
    && new Set(plans.map(({ amount }) => amount)).size === plans.length;
  return valid ? plans : clonePlans(fallback);
}

export function paymentPlansAreValid(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return false;
  const normalized = normalizePaymentPlans(value, []);
  return normalized.length === value.length;
}

export function lineSlipPlan(amountSatang, paymentPlans = DEFAULT_PAYMENT_PLANS) {
  const plans = normalizePaymentPlans(paymentPlans);
  const plan = plans.find(({ amount }) => amount * 100 === Number(amountSatang));
  if (!plan) return null;

  // Keep the existing convenient behaviour for 1-3 day packages: one
  // one-day code per day. Longer packages are delivered as one code.
  return plan.days <= 3
    ? { durationMinutes: 1440, codeCount: plan.days }
    : { durationMinutes: plan.days * 1440, codeCount: 1 };
}

export function lineSlipPlanSummary(paymentPlans = DEFAULT_PAYMENT_PLANS) {
  return normalizePaymentPlans(paymentPlans)
    .map(({ amount, days }) => `${amount} บาท = ${days} วัน`)
    .join(', ');
}
