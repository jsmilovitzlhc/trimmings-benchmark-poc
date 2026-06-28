const { Client } = require('pg');
const db = require('../server/db');

const NEON_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

async function main() {
  await db.initialize();

  if (!NEON_URL) {
    console.log('No DATABASE_URL set — skipping Neon import. Run with DATABASE_URL=... to import real data.');
    return;
  }

  const pg = new Client({ connectionString: NEON_URL });
  await pg.connect();
  console.log('Connected to Neon database');

  // --- Import Domestic 90CL ---
  console.log('\nImporting Domestic 90CL (Chemical Lean, Fresh 90%)...');
  const r90 = await pg.query(`
    SELECT date, price, low_price, high_price, total_pounds
    FROM meat_prices
    WHERE cut_name = 'Chemical Lean, Fresh  90%' AND section = 'National'
    ORDER BY date
  `);
  for (const r of r90.rows) {
    db.runNoSave(
      "INSERT OR REPLACE INTO assessments (series_id, date, value, low, high, volume, data_source) VALUES ('domestic_90cl', ?, ?, ?, ?, ?, 'historical')",
      [r.date.toISOString().split('T')[0], r.price, r.low_price, r.high_price, r.total_pounds]
    );
  }
  db.save();
  console.log(`  Imported ${r90.rows.length} rows (${r90.rows[0]?.date.toISOString().split('T')[0]} -> ${r90.rows[r90.rows.length - 1]?.date.toISOString().split('T')[0]})`);

  // --- Import Domestic 50CL ---
  console.log('\nImporting Domestic 50CL (Fresh 50% lean trimmings)...');
  const r50 = await pg.query(`
    SELECT date, price, low_price, high_price, total_pounds
    FROM meat_prices
    WHERE cut_name = 'Fresh 50% lean trimmings' AND section = 'Beef Trimmings'
    ORDER BY date
  `);
  for (const r of r50.rows) {
    db.runNoSave(
      "INSERT OR REPLACE INTO assessments (series_id, date, value, low, high, volume, data_source) VALUES ('domestic_50cl', ?, ?, ?, ?, ?, 'historical')",
      [r.date.toISOString().split('T')[0], r.price, r.low_price, r.high_price, r.total_pounds]
    );
  }
  db.save();
  console.log(`  Imported ${r50.rows.length} rows (${r50.rows[0]?.date.toISOString().split('T')[0]} -> ${r50.rows[r50.rows.length - 1]?.date.toISOString().split('T')[0]})`);

  await pg.end();

  // --- Report ---
  const bySource = db.queryAll("SELECT series_id, data_source, count(*) as c FROM assessments GROUP BY series_id, data_source ORDER BY series_id");
  console.log('\n=== Import Summary ===');
  for (const r of bySource) console.log(`  ${r.series_id}: ${r.c} rows (${r.data_source})`);
  console.log('\nImport complete.');
}

main().catch(e => { console.error('Import failed:', e.message); process.exit(1); });
