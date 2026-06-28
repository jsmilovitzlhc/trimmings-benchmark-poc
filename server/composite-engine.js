const db = require('./db');

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

function runAssessment(seriesId, date) {
  const trades = db.queryAll(
    "SELECT * FROM trades WHERE series_id = ? AND date = ? AND status IN ('pending', 'accepted')",
    [seriesId, date]
  );

  if (trades.length < CONFIG.MIN_TRADES_FOR_ASSESSMENT) {
    return { success: false, error: `Need at least ${CONFIG.MIN_TRADES_FOR_ASSESSMENT} trades, got ${trades.length}` };
  }

  const { clean, outliers } = detectOutliers(trades);

  for (const o of outliers) {
    db.runNoSave("UPDATE trades SET status = 'outlier' WHERE id = ?", [o.id]);
  }

  const value = calculateVWAP(clean);
  const prices = clean.map(t => t.price);

  db.runNoSave(
    "INSERT OR REPLACE INTO assessments (series_id, date, value, low, high, volume, data_source) VALUES (?, ?, ?, ?, ?, ?, 'assessed')",
    [seriesId, date, value, Math.min(...prices), Math.max(...prices), clean.reduce((s, t) => s + (t.volume || 0), 0)]
  );

  db.runNoSave(
    "INSERT INTO assessment_runs (series_id, date, method, input_trade_count, outlier_count, result_value, config) VALUES (?, ?, 'vwap', ?, ?, ?, ?)",
    [seriesId, date, trades.length, outliers.length, value, JSON.stringify(CONFIG)]
  );

  db.runNoSave(
    "INSERT INTO audit_log (event_type, entity_type, entity_id, actor, details) VALUES ('assessment_run', 'series', ?, 'system', ?)",
    [seriesId, JSON.stringify({ date, value, trades: trades.length, outliers: outliers.length })]
  );

  db.save();
  return { success: true, value, low: Math.min(...prices), high: Math.max(...prices), tradesUsed: clean.length, outliersRemoved: outliers.length };
}

function computeDerivedSeries(date) {
  const results = {};

  const d90 = db.queryOne("SELECT value FROM assessments WHERE series_id = 'domestic_90cl' AND date = ?", [date]);
  const d50 = db.queryOne("SELECT value FROM assessments WHERE series_id = 'domestic_50cl' AND date = ?", [date]);
  const i90 = db.queryOne("SELECT value FROM assessments WHERE series_id = 'imported_90cl' AND date = ?", [date]);

  if (d90 && d50) {
    const meatblock = (d90.value * CONFIG.MEATBLOCK_90CL_RATIO) + (d50.value * CONFIG.MEATBLOCK_50CL_RATIO);
    db.runNoSave(
      "INSERT OR REPLACE INTO assessments (series_id, date, value, data_source) VALUES ('75cl_meatblock', ?, ?, 'derived')",
      [date, meatblock]
    );
    results.meatblock = meatblock;
  }

  if (d90 && i90) {
    const importedCwt = i90.value * CONFIG.IMPORTED_90CL_LB_TO_CWT;
    const spread = d90.value - importedCwt;
    db.runNoSave(
      "INSERT OR REPLACE INTO assessments (series_id, date, value, data_source) VALUES ('trim_spread', ?, ?, 'derived')",
      [date, spread]
    );
    results.spread = spread;
  }

  // Compute burger benchmark for this date
  try {
    const burgerEngine = require('./burger-engine');
    const burgerResult = burgerEngine.computeBurgerDerived(date);
    if (burgerResult) results.burger_benchmark = burgerResult.total_cost;
  } catch (e) {
    // burger-engine not critical to core derived series
  }

  if (Object.keys(results).length > 0) db.save();
  return results;
}

function computeAllDerived() {
  const dates = db.queryAll(
    "SELECT DISTINCT date FROM assessments WHERE series_id IN ('domestic_90cl', 'domestic_50cl', 'imported_90cl') ORDER BY date"
  );

  let computed = 0;
  for (const { date } of dates) {
    const r = computeDerivedSeries(date);
    if (Object.keys(r).length > 0) computed++;
  }
  return { datesProcessed: dates.length, datesWithDerived: computed };
}

module.exports = { calculateVWAP, detectOutliers, runAssessment, computeDerivedSeries, computeAllDerived, CONFIG };
