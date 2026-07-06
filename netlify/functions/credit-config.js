const CREDIT_TIERS = {
  1166862: { credits: 25, tierName: 'early_bird' },
  1166895: { credits: 50, tierName: 'standard' },
  1166899: { credits: 100, tierName: 'founding_teacher' },
  1166902: { credits: 300, tierName: 'department_pack' },
  1873796: { credits: 20, tierName: 'refill_small', isRefill: true },
  1873828: { credits: 50, tierName: 'refill_large', isRefill: true },
};

const DEV_KEY = 'TEST-TEST-TEST-TEST';
const LOCAL_TEST_STANDARD_KEY = 'LOCAL-TEST-STANDARD';

function getCreditTierByProductId(productId) {
  const normalizedId = Number(productId);
  return Number.isFinite(normalizedId) ? CREDIT_TIERS[normalizedId] || null : null;
}

module.exports = {
  CREDIT_TIERS,
  DEV_KEY,
  LOCAL_TEST_STANDARD_KEY,
  getCreditTierByProductId,
};
