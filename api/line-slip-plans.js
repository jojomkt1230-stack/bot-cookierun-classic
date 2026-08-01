const PLANS_BY_SATANG = new Map([
  [1500, { durationMinutes: 1440, codeCount: 1 }],
  [3000, { durationMinutes: 1440, codeCount: 2 }],
  [4500, { durationMinutes: 1440, codeCount: 3 }],
  [10000, { durationMinutes: 10080, codeCount: 1 }],
  [35000, { durationMinutes: 43200, codeCount: 1 }]
]);

export function lineSlipPlan(amountSatang) {
  const plan = PLANS_BY_SATANG.get(Number(amountSatang));
  return plan ? { ...plan } : null;
}

export function lineSlipPlanSummary() {
  return '15 บาท = 1 วัน 1 โค้ด, 30 บาท = 1 วัน 2 โค้ด, 45 บาท = 1 วัน 3 โค้ด, 100 บาท = 7 วัน 1 โค้ด และ 350 บาท = 30 วัน 1 โค้ด';
}
