const db = require('../server/db');
const fs = require('fs');
const path = require('path');

async function main() {
  await db.initialize();

  const data = {
    series: db.queryAll('SELECT * FROM series'),
    assessments: db.queryAll('SELECT * FROM assessments ORDER BY date'),
    contributors: db.queryAll('SELECT * FROM contributors'),
    trades: db.queryAll('SELECT * FROM trades ORDER BY date DESC'),
    audit_log: db.queryAll('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100'),
  };

  const outPath = path.join(__dirname, '..', 'data', 'snapshot.json');
  fs.writeFileSync(outPath, JSON.stringify(data));
  console.log(`Exported ${data.assessments.length} assessments, ${data.trades.length} trades, ${data.contributors.length} contributors`);
  console.log(`Snapshot: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
