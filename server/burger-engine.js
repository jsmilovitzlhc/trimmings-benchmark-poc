const db = require('./db');
const recipe = require('./burger-recipe.json');

const UNIT_CONVERSIONS = {
  'cwt_to_lb': 1 / 100,
  'lb_to_cwt': 100,
  'lb_to_oz': 1 / 16,
  'oz_to_lb': 16,
  'cwt_to_oz': 1 / 1600,
  'oz_to_cwt': 1600,
};

function unitConvert(price, fromUnit, toUnit) {
  if (fromUnit === toUnit) return price;
  const key = `${fromUnit}_to_${toUnit}`;
  const factor = UNIT_CONVERSIONS[key];
  if (factor == null) {
    throw new Error(`No conversion from ${fromUnit} to ${toUnit}`);
  }
  return price * factor;
}

function blendRatio(targetCL, clHigh, clLow) {
  if (clHigh === clLow) throw new Error('clHigh and clLow cannot be equal');
  if (targetCL < clLow || targetCL > clHigh) {
    throw new Error(`targetCL ${targetCL} outside range [${clLow}, ${clHigh}]`);
  }
  const highProportion = (targetCL - clLow) / (clHigh - clLow);
  const lowProportion = 1 - highProportion;
  return { highProportion, lowProportion };
}

function getSeriesUnit(seriesId) {
  const series = db.queryOne('SELECT unit FROM series WHERE id = ?', [seriesId]);
  return series ? series.unit : null;
}

function resolveNonMeatCosts(variantConfig) {
  const costs = {};
  let total = 0;

  for (const [key, item] of Object.entries(recipe.non_meat)) {
    if (key === 'cheese' && !variantConfig.include_cheese) continue;

    let price = item.static_price_usd;
    let source = item.price_source;

    costs[key] = {
      label: item.label,
      quantity: item.quantity,
      unit: item.unit,
      price_usd: price,
      source: source,
    };
    total += price;
  }
  return { items: costs, total };
}

function computeBurgerBenchmark(date, variantOpts = {}) {
  const pattySize = variantOpts.patty_size || 'quarter_pound';
  const blendSource = variantOpts.blend_source || 'domestic';
  const pattyType = variantOpts.patty_type || 'hamburger';
  const scope = variantOpts.scope || 'full_burger';

  const sizeConfig = recipe.variants.patty_size[pattySize];
  const blendConfig = recipe.variants.blend_source[blendSource];
  const typeConfig = recipe.variants.patty_type[pattyType];
  const scopeConfig = recipe.variants.scope[scope];

  const rawWeightOz = sizeConfig.raw_weight_oz;

  let clHighSeries = blendConfig.cl_high_series;
  let clLowSeries = blendConfig.cl_low_series;

  const highPrice = db.queryOne(
    'SELECT value FROM assessments WHERE series_id = ? AND date = ?',
    [clHighSeries, date]
  );
  const lowPrice = db.queryOne(
    'SELECT value FROM assessments WHERE series_id = ? AND date = ?',
    [clLowSeries, date]
  );

  if (!highPrice || !lowPrice) return null;

  const highUnit = getSeriesUnit(clHighSeries);
  const lowUnit = getSeriesUnit(clLowSeries);

  const highFromUnit = highUnit === '$/lb' ? 'lb' : 'cwt';
  const lowFromUnit = lowUnit === '$/lb' ? 'lb' : 'cwt';

  const highPricePerOz = unitConvert(highPrice.value, highFromUnit, 'oz');
  const lowPricePerOz = unitConvert(lowPrice.value, lowFromUnit, 'oz');

  const { highProportion, lowProportion } = blendRatio(
    recipe.patty.target_cl,
    recipe.patty.cl_high.cl,
    recipe.patty.cl_low.cl
  );

  const blendedPricePerOz = (highPricePerOz * highProportion) + (lowPricePerOz * lowProportion);
  const pattyCost = blendedPricePerOz * rawWeightOz;

  const breakdown = {
    patty: {
      cost: pattyCost,
      weight_oz: rawWeightOz,
      blend: {
        high: { series: clHighSeries, proportion: highProportion, price_raw: highPrice.value, unit: highUnit },
        low: { series: clLowSeries, proportion: lowProportion, price_raw: lowPrice.value, unit: lowUnit },
      },
      blended_price_per_oz: blendedPricePerOz,
    },
  };

  let totalCost = pattyCost;

  if (scopeConfig.include_non_meat) {
    const nonMeat = resolveNonMeatCosts({ include_cheese: typeConfig.include_cheese });
    breakdown.non_meat = nonMeat.items;
    breakdown.non_meat_total = nonMeat.total;
    totalCost += nonMeat.total;
  }

  return {
    date,
    total_cost: totalCost,
    breakdown,
    variant: { patty_type: pattyType, patty_size: pattySize, blend_source: blendSource, scope },
  };
}

function computeBurgerHistory(variantOpts = {}) {
  const blendSource = variantOpts.blend_source || 'domestic';
  const blendConfig = recipe.variants.blend_source[blendSource];

  const dates = db.queryAll(
    `SELECT DISTINCT a1.date FROM assessments a1
     JOIN assessments a2 ON a1.date = a2.date
     WHERE a1.series_id = ? AND a2.series_id = ?
     ORDER BY a1.date`,
    [blendConfig.cl_high_series, blendConfig.cl_low_series]
  );

  const history = [];
  let baseValue = null;

  for (const { date } of dates) {
    const result = computeBurgerBenchmark(date, variantOpts);
    if (!result) continue;

    if (date === recipe.index_base_date || (baseValue === null && date >= recipe.index_base_date)) {
      baseValue = result.total_cost;
    }

    result.indexed = baseValue ? (result.total_cost / baseValue) * 100 : null;
    history.push(result);
  }

  if (baseValue === null && history.length > 0) {
    baseValue = history[0].total_cost;
    for (const h of history) {
      h.indexed = (h.total_cost / baseValue) * 100;
    }
  }

  return { history, baseValue, baseDate: recipe.index_base_date };
}

function computeBurgerDerived(date) {
  const defaultResult = computeBurgerBenchmark(date);
  if (!defaultResult) return null;

  db.runNoSave(
    "INSERT OR REPLACE INTO assessments (series_id, date, value, data_source) VALUES ('burger_benchmark', ?, ?, 'derived')",
    [date, defaultResult.total_cost]
  );
  db.save();

  return defaultResult;
}

function computeAllBurgerDerived() {
  const dates = db.queryAll(
    `SELECT DISTINCT a1.date FROM assessments a1
     JOIN assessments a2 ON a1.date = a2.date
     WHERE a1.series_id = 'domestic_90cl' AND a2.series_id = 'domestic_50cl'
     ORDER BY a1.date`
  );

  let computed = 0;
  for (const { date } of dates) {
    const r = computeBurgerDerived(date);
    if (r) computed++;
  }
  return { datesProcessed: dates.length, datesComputed: computed };
}

function getStartupReport() {
  const report = { components: {}, summary: '' };
  const realCount = 0;
  let staticCount = 0;

  report.components.patty_90cl = { source: 'db', series: recipe.patty.cl_high.series_id, status: 'live' };
  report.components.patty_50cl = { source: 'db', series: recipe.patty.cl_low.series_id, status: 'live' };

  for (const [key, item] of Object.entries(recipe.non_meat)) {
    report.components[key] = {
      source: item.price_source,
      price: item.static_price_usd,
      status: item.price_source === 'static' ? 'STATIC PLACEHOLDER' : 'live',
    };
    if (item.price_source === 'static') staticCount++;
  }

  report.summary = `Burger Benchmark: 2 meat components from DB (live), ${staticCount} non-meat components using STATIC PLACEHOLDERS`;
  return report;
}

module.exports = {
  unitConvert,
  blendRatio,
  computeBurgerBenchmark,
  computeBurgerHistory,
  computeBurgerDerived,
  computeAllBurgerDerived,
  resolveNonMeatCosts,
  getStartupReport,
  recipe,
};
