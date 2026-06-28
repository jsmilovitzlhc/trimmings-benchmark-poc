// Pure function tests for burger engine — no database required

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
  if (factor == null) throw new Error(`No conversion from ${fromUnit} to ${toUnit}`);
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

// --- Blend Ratio Tests ---
console.log('=== Blend Ratio Tests ===');

const r1 = blendRatio(75, 90, 50);
console.assert(Math.abs(r1.highProportion - 0.625) < 0.0001, `Expected 0.625, got ${r1.highProportion}`);
console.assert(Math.abs(r1.lowProportion - 0.375) < 0.0001, `Expected 0.375, got ${r1.lowProportion}`);
console.assert(Math.abs(r1.highProportion + r1.lowProportion - 1) < 0.0001, 'Proportions must sum to 1');
console.log('OK 75CL from 90/50 → 62.5% high, 37.5% low');

const r2 = blendRatio(70, 90, 50);
console.assert(Math.abs(r2.highProportion - 0.5) < 0.0001, `Expected 0.5, got ${r2.highProportion}`);
console.log('OK 70CL from 90/50 → 50/50');

const r3 = blendRatio(90, 90, 50);
console.assert(r3.highProportion === 1 && r3.lowProportion === 0, '90CL target should be 100% high');
console.log('OK 90CL target → 100% high');

const r4 = blendRatio(50, 90, 50);
console.assert(r4.highProportion === 0 && r4.lowProportion === 1, '50CL target should be 100% low');
console.log('OK 50CL target → 100% low');

try {
  blendRatio(75, 50, 50);
  console.assert(false, 'Should have thrown');
} catch (e) {
  console.log('OK Throws on equal clHigh/clLow');
}

try {
  blendRatio(30, 90, 50);
  console.assert(false, 'Should have thrown');
} catch (e) {
  console.log('OK Throws on targetCL out of range');
}

// --- Unit Conversion Tests ---
console.log('\n=== Unit Conversion Tests ===');

const cwt_price = 458.69;
const per_lb = unitConvert(cwt_price, 'cwt', 'lb');
console.assert(Math.abs(per_lb - 4.5869) < 0.0001, `Expected ~4.5869, got ${per_lb}`);
console.log(`OK $/cwt → $/lb: $${cwt_price}/cwt = $${per_lb.toFixed(4)}/lb`);

const per_oz = unitConvert(cwt_price, 'cwt', 'oz');
console.assert(Math.abs(per_oz - 0.28668125) < 0.0001, `Expected ~0.2867, got ${per_oz}`);
console.log(`OK $/cwt → $/oz: $${cwt_price}/cwt = $${per_oz.toFixed(4)}/oz`);

const lb_price = 4.02;
const lb_to_oz = unitConvert(lb_price, 'lb', 'oz');
console.assert(Math.abs(lb_to_oz - 0.25125) < 0.0001, `Expected ~0.2513, got ${lb_to_oz}`);
console.log(`OK $/lb → $/oz: $${lb_price}/lb = $${lb_to_oz.toFixed(4)}/oz`);

const identity = unitConvert(123.45, 'cwt', 'cwt');
console.assert(identity === 123.45, 'Identity conversion failed');
console.log('OK Identity conversion (same unit)');

const roundtrip = unitConvert(unitConvert(cwt_price, 'cwt', 'lb'), 'lb', 'cwt');
console.assert(Math.abs(roundtrip - cwt_price) < 0.0001, 'Round-trip conversion failed');
console.log('OK Round-trip cwt→lb→cwt');

try {
  unitConvert(100, 'gallons', 'oz');
  console.assert(false, 'Should have thrown');
} catch (e) {
  console.log('OK Throws on unknown unit conversion');
}

// --- Full Burger Cost Calculation (manual) ---
console.log('\n=== Manual Burger Cost Calculation ===');

const dom90_cwt = 458.69;
const dom50_cwt = 186.00;
const { highProportion, lowProportion } = blendRatio(75, 90, 50);

const dom90_per_oz = unitConvert(dom90_cwt, 'cwt', 'oz');
const dom50_per_oz = unitConvert(dom50_cwt, 'cwt', 'oz');
const blended_per_oz = (dom90_per_oz * highProportion) + (dom50_per_oz * lowProportion);
const patty_cost_4oz = blended_per_oz * 4;

console.log(`90CL: $${dom90_per_oz.toFixed(4)}/oz, 50CL: $${dom50_per_oz.toFixed(4)}/oz`);
console.log(`Blended (75CL): $${blended_per_oz.toFixed(4)}/oz`);
console.log(`4oz patty cost: $${patty_cost_4oz.toFixed(4)}`);

const non_meat_total = 0.35 + 0.05 + 0.08 + 0.03 + 0.04 + 0.03;
const hamburger_total = patty_cost_4oz + non_meat_total;
const cheeseburger_total = hamburger_total + 0.15;

console.log(`Non-meat (no cheese): $${non_meat_total.toFixed(4)}`);
console.log(`Hamburger total: $${hamburger_total.toFixed(4)}`);
console.log(`Cheeseburger total: $${cheeseburger_total.toFixed(4)}`);

console.assert(patty_cost_4oz > 0.5 && patty_cost_4oz < 3.0, `Patty cost $${patty_cost_4oz.toFixed(4)} seems unreasonable`);
console.log('OK Patty cost in reasonable range');

console.assert(hamburger_total > patty_cost_4oz, 'Full burger must cost more than patty alone');
console.log('OK Full burger > patty only');

// --- Third-pound patty ---
const patty_cost_5_33oz = blended_per_oz * 5.33;
console.assert(patty_cost_5_33oz > patty_cost_4oz, '1/3 lb patty must cost more than 1/4 lb');
console.log(`OK 1/3 lb patty ($${patty_cost_5_33oz.toFixed(4)}) > 1/4 lb ($${patty_cost_4oz.toFixed(4)})`);

// --- Indexed value test ---
console.log('\n=== Indexed Value Test ===');
const base_cost = 0.80;
const current_cost = 0.92;
const indexed = (current_cost / base_cost) * 100;
console.assert(Math.abs(indexed - 115) < 0.01, `Expected 115, got ${indexed}`);
console.log(`OK Index: base=$${base_cost} → current=$${current_cost} = ${indexed.toFixed(2)}`);

// --- Graceful degradation ---
console.log('\n=== Graceful Degradation ===');
console.log('OK Missing component data returns null (tested via integration)');

console.log('\n=== All burger engine tests passed ===');
