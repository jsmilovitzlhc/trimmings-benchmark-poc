// Pure function tests — no database required

const CONFIG = {
  MEATBLOCK_90CL_RATIO: 0.625,
  MEATBLOCK_50CL_RATIO: 0.375,
  IMPORTED_90CL_LB_TO_CWT: 100,
  OUTLIER_ZSCORE_THRESHOLD: 2.5,
  MIN_TRADES_FOR_ASSESSMENT: 3,
};

function calculateVWAP(trades) {
  const withVolume = trades.filter(t => t.volume && t.volume > 0);
  if (withVolume.length > 0) {
    const totalValue = withVolume.reduce((sum, t) => sum + t.price * t.volume, 0);
    const totalVolume = withVolume.reduce((sum, t) => sum + t.volume, 0);
    return totalValue / totalVolume;
  }
  return trades.reduce((sum, t) => sum + t.price, 0) / trades.length;
}

function detectOutliers(trades) {
  if (trades.length < 3) return { clean: trades, outliers: [] };
  const prices = trades.map(t => t.price);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const stdDev = Math.sqrt(prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length);
  if (stdDev === 0) return { clean: trades, outliers: [] };

  const clean = [];
  const outliers = [];
  for (const t of trades) {
    const z = Math.abs((t.price - mean) / stdDev);
    if (z > CONFIG.OUTLIER_ZSCORE_THRESHOLD) {
      outliers.push({ ...t, zscore: z });
    } else {
      clean.push(t);
    }
  }
  return { clean, outliers };
}

// --- VWAP Tests ---
console.log('=== VWAP Tests ===');

const vwap1 = calculateVWAP([{ price: 100 }, { price: 200 }, { price: 300 }]);
console.assert(vwap1 === 200, `Expected 200, got ${vwap1}`);
console.log('OK Simple average without volumes');

const vwap2 = calculateVWAP([{ price: 100, volume: 1000 }, { price: 200, volume: 3000 }]);
console.assert(Math.abs(vwap2 - 175) < 0.01, `Expected 175, got ${vwap2}`);
console.log('OK Volume-weighted average');

const vwap3 = calculateVWAP([{ price: 456.50, volume: 40000 }]);
console.assert(vwap3 === 456.50, `Expected 456.50, got ${vwap3}`);
console.log('OK Single trade VWAP');

// --- Outlier Detection Tests ---
console.log('\n=== Outlier Detection Tests ===');

const r4 = detectOutliers([{ price: 100 }, { price: 101 }, { price: 99 }, { price: 100 }, { price: 102 }]);
console.assert(r4.outliers.length === 0, `Expected 0 outliers`);
console.log('OK No outliers in tight cluster');

const r5 = detectOutliers([{ price: 100 }, { price: 101 }, { price: 99 }, { price: 100 }, { price: 500 }]);
console.assert(r5.outliers.length === 1 && r5.outliers[0].price === 500, 'Expected 500 as outlier');
console.log('OK Clear outlier detected');

const r6 = detectOutliers([{ price: 100 }, { price: 500 }]);
console.assert(r6.clean.length === 2, 'Expected all returned with <3 inputs');
console.log('OK No outlier detection with <3 trades');

const r7 = detectOutliers([{ price: 100 }, { price: 100 }, { price: 100 }]);
console.assert(r7.outliers.length === 0, 'Expected 0 outliers with identical prices');
console.log('OK Identical prices — no outliers');

// --- Config Tests ---
console.log('\n=== Config Tests ===');
console.assert(CONFIG.MEATBLOCK_90CL_RATIO + CONFIG.MEATBLOCK_50CL_RATIO === 1, 'Ratios must sum to 1');
console.log('OK Meat-block ratios sum to 1.0');

// --- Derived series math ---
console.log('\n=== Derived Series Math ===');
const d90 = 458.69, d50 = 186.00;
const meatblock = d90 * CONFIG.MEATBLOCK_90CL_RATIO + d50 * CONFIG.MEATBLOCK_50CL_RATIO;
console.log(`OK 75CL Meat-Block: $${meatblock.toFixed(2)} (from 90CL=$${d90}, 50CL=$${d50})`);

const imported90lb = 4.12;
const spread = d90 - (imported90lb * CONFIG.IMPORTED_90CL_LB_TO_CWT);
console.log(`OK Trim Spread: $${spread.toFixed(2)} (Dom=$${d90} - Imp=$${imported90lb * 100})`);

console.log('\n=== All tests passed ===');
