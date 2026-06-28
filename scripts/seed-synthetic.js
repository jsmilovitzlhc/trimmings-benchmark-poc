const db = require('../server/db');

async function main() {
  await db.initialize();
  console.log('Seeding synthetic data...');

  // --- Synthetic Imported 90CL ---
  const domestic90 = db.queryAll("SELECT date, value FROM assessments WHERE series_id = 'domestic_90cl' ORDER BY date");

  if (domestic90.length > 0) {
    console.log(`\nGenerating Imported 90CL from ${domestic90.length} domestic 90CL records...`);
    for (const r of domestic90) {
      const ratio = 0.009 + (Math.random() - 0.5) * 0.001;
      const price = +(r.value * ratio).toFixed(2);
      db.runNoSave(
        "INSERT OR REPLACE INTO assessments (series_id, date, value, low, high, data_source) VALUES ('imported_90cl', ?, ?, ?, ?, 'synthetic')",
        [r.date, price, +(price * 0.98).toFixed(2), +(price * 1.02).toFixed(2)]
      );
    }
    db.save();
    console.log(`  Generated ${domestic90.length} imported 90CL records (synthetic)`);
  } else {
    console.log('\nNo domestic 90CL found. Generating standalone imported 90CL...');
    const startDate = new Date('2024-01-02');
    const endDate = new Date('2026-06-28');
    let basePrice = 3.85;
    let count = 0;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      basePrice += (Math.random() - 0.5) * 0.08;
      basePrice = Math.max(3.20, Math.min(4.80, basePrice));
      const price = +basePrice.toFixed(2);
      db.runNoSave(
        "INSERT OR REPLACE INTO assessments (series_id, date, value, low, high, data_source) VALUES ('imported_90cl', ?, ?, ?, ?, 'synthetic')",
        [d.toISOString().split('T')[0], price, +(price * 0.98).toFixed(2), +(price * 1.02).toFixed(2)]
      );
      count++;
    }
    db.save();
    console.log(`  Generated ${count} imported 90CL records (synthetic)`);
  }

  // --- Check if 50CL needs synthetic data ---
  const existing50 = db.queryOne("SELECT count(*) as c FROM assessments WHERE series_id = 'domestic_50cl'").c;
  if (existing50 === 0) {
    console.log('\nNo domestic 50CL found. Generating synthetic...');
    let basePrice = 140;
    const startDate = new Date('2020-01-02');
    const endDate = new Date('2026-06-28');
    let count = 0;
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      basePrice += (Math.random() - 0.5) * 4;
      basePrice = Math.max(80, Math.min(250, basePrice));
      db.runNoSave(
        "INSERT OR REPLACE INTO assessments (series_id, date, value, low, high, data_source) VALUES ('domestic_50cl', ?, ?, ?, ?, 'synthetic')",
        [d.toISOString().split('T')[0], +basePrice.toFixed(2), +(basePrice * 0.95).toFixed(2), +(basePrice * 1.05).toFixed(2)]
      );
      count++;
    }
    db.save();
    console.log(`  Generated ${count} domestic 50CL records (synthetic)`);
  }

  // --- Compute derived series ---
  console.log('\nComputing derived series (75CL Meat-Block + Trim Spread)...');
  const engine = require('../server/composite-engine');
  const result = engine.computeAllDerived();
  console.log(`  Processed ${result.datesProcessed} dates, derived on ${result.datesWithDerived} dates`);

  // --- Create synthetic contributors ---
  console.log('\nCreating synthetic contributor accounts...');
  const contributors = [
    { id: 'contrib-001', name: 'Alpha Packing Co.', company: 'Alpha Meats Inc.' },
    { id: 'contrib-002', name: 'Midwest Beef Trading', company: 'MBT Holdings' },
    { id: 'contrib-003', name: 'Pacific Coast Provisions', company: 'PCP Foods' },
    { id: 'contrib-004', name: 'Great Plains Protein', company: 'GPP Corp' },
    { id: 'contrib-005', name: 'Eastern Seaboard Meats', company: 'ESM Group' },
    { id: 'contrib-006', name: 'Southern Trim Supply', company: 'STS Beef' },
    { id: 'contrib-007', name: 'Rocky Mountain Cuts', company: 'RMC Partners' },
    { id: 'contrib-008', name: 'Heartland Processors', company: 'Heartland Foods' },
    { id: 'contrib-009', name: 'Lakeshore Beef Co.', company: 'Lakeshore Holdings' },
    { id: 'contrib-010', name: 'Valley Fresh Trading', company: 'VFT Inc.' },
  ];

  for (const c of contributors) {
    db.runNoSave("INSERT OR REPLACE INTO contributors (id, name, company, is_active, is_synthetic) VALUES (?, ?, ?, 1, 1)",
      [c.id, c.name, c.company]);
  }
  db.save();
  console.log(`  Created ${contributors.length} synthetic contributors`);

  // --- Synthetic trades ---
  console.log('\nGenerating synthetic trade submissions...');
  const recentDates = db.queryAll("SELECT DISTINCT date FROM assessments WHERE series_id = 'domestic_90cl' ORDER BY date DESC LIMIT 10");
  let tradeCount = 0;

  for (const { date } of recentDates) {
    const assessment = db.queryOne("SELECT value FROM assessments WHERE series_id = 'domestic_90cl' AND date = ?", [date]);
    if (!assessment) continue;

    const numContribs = 4 + Math.floor(Math.random() * 4);
    const shuffled = [...contributors].sort(() => Math.random() - 0.5).slice(0, numContribs);

    for (const c of shuffled) {
      const variance = (Math.random() - 0.5) * 10;
      const price = +(assessment.value + variance).toFixed(2);
      const volume = Math.floor(20000 + Math.random() * 60000);
      db.runNoSave("INSERT INTO trades (contributor_id, series_id, date, price, volume, unit, status) VALUES (?, ?, ?, ?, ?, ?, 'accepted')",
        [c.id, 'domestic_90cl', date, price, volume, '$/cwt']);
      tradeCount++;
    }
  }
  db.save();
  console.log(`  Generated ${tradeCount} synthetic trades`);

  // --- Final report ---
  const stats = db.queryAll('SELECT series_id, data_source, count(*) as c FROM assessments GROUP BY series_id, data_source ORDER BY series_id');
  console.log('\n=== Seed Summary ===');
  for (const s of stats) console.log(`  ${s.series_id}: ${s.c} (${s.data_source})`);
  console.log(`Trades: ${db.queryOne('SELECT count(*) as c FROM trades').c}`);
  console.log(`Contributors: ${db.queryOne('SELECT count(*) as c FROM contributors').c}`);
  console.log('\nSeed complete.');
}

main().catch(e => { console.error('Seed failed:', e.message); process.exit(1); });
