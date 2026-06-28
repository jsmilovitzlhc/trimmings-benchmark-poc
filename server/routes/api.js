const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const db = require('../db');
const engine = require('../composite-engine');
const burgerEngine = require('../burger-engine');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function getRole(req) {
  return req.headers['x-role'] || 'subscriber';
}

function getContributorId(req) {
  return req.headers['x-contributor-id'] || null;
}

router.get('/series', (req, res) => {
  res.json(db.queryAll('SELECT * FROM series WHERE is_active = 1'));
});

router.get('/assessments', (req, res) => {
  const { series_id, start_date, end_date, limit } = req.query;
  let sql = 'SELECT * FROM assessments WHERE 1=1';
  const params = [];

  if (series_id) { sql += ' AND series_id = ?'; params.push(series_id); }
  if (start_date) { sql += ' AND date >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND date <= ?'; params.push(end_date); }
  sql += ' ORDER BY date DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }

  res.json(db.queryAll(sql, params));
});

router.get('/assessments/latest', (req, res) => {
  const seriesList = db.queryAll('SELECT * FROM series WHERE is_active = 1');
  const latest = seriesList.map(s => {
    const a = db.queryOne('SELECT * FROM assessments WHERE series_id = ? ORDER BY date DESC LIMIT 1', [s.id]);
    const prev = a ? db.queryOne('SELECT * FROM assessments WHERE series_id = ? AND date < ? ORDER BY date DESC LIMIT 1', [s.id, a.date]) : null;
    return {
      ...s,
      latest: a,
      previous: prev,
      change: a && prev ? a.value - prev.value : null,
      changePct: a && prev && prev.value ? ((a.value - prev.value) / prev.value * 100) : null,
    };
  });
  res.json(latest);
});

router.get('/assessments/export', (req, res) => {
  const { series_id, start_date, end_date } = req.query;
  let sql = `SELECT a.date, s.name as series, a.value, a.low, a.high, a.volume, a.data_source
    FROM assessments a JOIN series s ON a.series_id = s.id WHERE 1=1`;
  const params = [];
  if (series_id) { sql += ' AND a.series_id = ?'; params.push(series_id); }
  if (start_date) { sql += ' AND a.date >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND a.date <= ?'; params.push(end_date); }
  sql += ' ORDER BY a.date DESC, s.name';

  const rows = db.queryAll(sql, params);
  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=trimmings-export.csv');
  res.send(csv);
});

router.post('/trades', (req, res) => {
  if (getRole(req) !== 'contributor' && getRole(req) !== 'admin') return res.status(403).json({ error: 'Contributors only' });
  const contributorId = getContributorId(req);
  if (!contributorId) return res.status(400).json({ error: 'Missing contributor ID' });

  const { series_id, date, price, volume, unit, notes } = req.body;
  if (!series_id || !date || !price) return res.status(400).json({ error: 'Missing required fields' });

  const series = db.queryOne('SELECT * FROM series WHERE id = ?', [series_id]);
  if (!series) return res.status(400).json({ error: 'Invalid series' });

  const result = db.run(
    'INSERT INTO trades (contributor_id, series_id, date, price, volume, unit, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [contributorId, series_id, date, price, volume || null, unit || series.unit, notes || null]
  );

  db.run("INSERT INTO audit_log (event_type, entity_type, entity_id, actor, details) VALUES ('trade_submit', 'trade', ?, ?, ?)",
    [String(result.lastInsertRowid), contributorId, JSON.stringify({ series_id, date, price })]);

  res.json({ id: result.lastInsertRowid, status: 'pending' });
});

router.post('/trades/upload', upload.single('file'), (req, res) => {
  if (getRole(req) !== 'contributor' && getRole(req) !== 'admin') return res.status(403).json({ error: 'Contributors only' });
  const contributorId = getContributorId(req);
  if (!contributorId) return res.status(400).json({ error: 'Missing contributor ID' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let records;
  try {
    records = parse(req.file.buffer.toString(), { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid CSV format' });
  }

  const results = { accepted: 0, rejected: 0, errors: [] };
  for (const [i, r] of records.entries()) {
    if (!r.series_id || !r.date || !r.price) {
      results.rejected++;
      results.errors.push({ row: i + 2, error: 'Missing required fields' });
      continue;
    }
    const series = db.queryOne('SELECT * FROM series WHERE id = ?', [r.series_id]);
    if (!series) {
      results.rejected++;
      results.errors.push({ row: i + 2, error: `Unknown series: ${r.series_id}` });
      continue;
    }
    db.runNoSave('INSERT INTO trades (contributor_id, series_id, date, price, volume, unit, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [contributorId, r.series_id, r.date, parseFloat(r.price), r.volume ? parseFloat(r.volume) : null, r.unit || series.unit, r.notes || null]);
    results.accepted++;
  }
  db.save();

  db.run("INSERT INTO audit_log (event_type, entity_type, entity_id, actor, details) VALUES ('bulk_upload', 'trades', ?, ?, ?)",
    [null, contributorId, JSON.stringify({ accepted: results.accepted, rejected: results.rejected })]);

  res.json(results);
});

router.get('/trades', (req, res) => {
  const role = getRole(req);
  const contributorId = getContributorId(req);

  if (role === 'contributor') {
    if (!contributorId) return res.status(400).json({ error: 'Missing contributor ID' });
    return res.json(db.queryAll('SELECT * FROM trades WHERE contributor_id = ? ORDER BY date DESC LIMIT 100', [contributorId]));
  }

  if (role === 'admin') {
    return res.json(db.queryAll('SELECT * FROM trades ORDER BY date DESC LIMIT 200'));
  }

  return res.status(403).json({ error: 'Subscribers cannot view raw trades' });
});

router.post('/assessments/run', (req, res) => {
  const { series_id, date } = req.body;
  if (!series_id || !date) return res.status(400).json({ error: 'Missing series_id or date' });
  const result = engine.runAssessment(series_id, date);
  if (result.success) engine.computeDerivedSeries(date);
  res.json(result);
});

router.post('/assessments/recompute-derived', (req, res) => {
  res.json(engine.computeAllDerived());
});

router.get('/contributors', (req, res) => {
  if (getRole(req) === 'admin') return res.json(db.queryAll('SELECT * FROM contributors'));
  return res.status(403).json({ error: 'Admin only' });
});

router.get('/audit-log', (req, res) => {
  const { limit } = req.query;
  res.json(db.queryAll('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?', [parseInt(limit) || 50]));
});

router.get('/config', (req, res) => {
  res.json(engine.CONFIG);
});

router.get('/trades/template', (req, res) => {
  const csv = stringify([
    { series_id: 'domestic_90cl', date: '2026-06-28', price: '460.00', volume: '40000', unit: '$/cwt', notes: '' },
    { series_id: 'domestic_50cl', date: '2026-06-28', price: '185.00', volume: '50000', unit: '$/cwt', notes: '' },
  ], { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=trade-upload-template.csv');
  res.send(csv);
});

router.get('/stats', (req, res) => {
  const assessmentCount = db.queryOne('SELECT count(*) as c FROM assessments').c;
  const tradeCount = db.queryOne('SELECT count(*) as c FROM trades').c;
  const contributorCount = db.queryOne('SELECT count(*) as c FROM contributors').c;
  const dateRange = db.queryOne('SELECT min(date) as mn, max(date) as mx FROM assessments');
  const dataSourceBreakdown = db.queryAll("SELECT data_source, count(*) as c FROM assessments GROUP BY data_source");
  res.json({ assessmentCount, tradeCount, contributorCount, dateRange, dataSourceBreakdown });
});

// --- Burger Benchmark Routes ---

router.get('/burger/latest', (req, res) => {
  const variant = {
    patty_type: req.query.patty_type || 'hamburger',
    patty_size: req.query.patty_size || 'quarter_pound',
    blend_source: req.query.blend_source || 'domestic',
    scope: req.query.scope || 'full_burger',
  };

  const latest = db.queryOne(
    "SELECT date FROM assessments WHERE series_id IN ('domestic_90cl', 'domestic_50cl') ORDER BY date DESC LIMIT 1"
  );
  if (!latest) return res.json({ error: 'No data' });

  const result = burgerEngine.computeBurgerBenchmark(latest.date, variant);
  if (!result) return res.json({ error: 'Missing component data for latest date' });

  const prev = db.queryOne(
    "SELECT DISTINCT a1.date FROM assessments a1 JOIN assessments a2 ON a1.date = a2.date WHERE a1.series_id = 'domestic_90cl' AND a2.series_id = 'domestic_50cl' AND a1.date < ? ORDER BY a1.date DESC LIMIT 1",
    [latest.date]
  );

  let change = null, changePct = null;
  if (prev) {
    const prevResult = burgerEngine.computeBurgerBenchmark(prev.date, variant);
    if (prevResult) {
      change = result.total_cost - prevResult.total_cost;
      changePct = (change / prevResult.total_cost) * 100;
    }
  }

  res.json({ ...result, change, changePct });
});

router.get('/burger/history', (req, res) => {
  const variant = {
    patty_type: req.query.patty_type || 'hamburger',
    patty_size: req.query.patty_size || 'quarter_pound',
    blend_source: req.query.blend_source || 'domestic',
    scope: req.query.scope || 'full_burger',
  };
  res.json(burgerEngine.computeBurgerHistory(variant));
});

router.get('/burger/recipe', (req, res) => {
  res.json(burgerEngine.recipe);
});

router.get('/burger/report', (req, res) => {
  res.json(burgerEngine.getStartupReport());
});

router.get('/burger/export', (req, res) => {
  const variant = {
    patty_type: req.query.patty_type || 'hamburger',
    patty_size: req.query.patty_size || 'quarter_pound',
    blend_source: req.query.blend_source || 'domestic',
    scope: req.query.scope || 'full_burger',
  };

  const { history } = burgerEngine.computeBurgerHistory(variant);
  const rows = history.map(h => ({
    date: h.date,
    total_cost: h.total_cost.toFixed(4),
    indexed: h.indexed ? h.indexed.toFixed(2) : '',
    patty_cost: h.breakdown.patty.cost.toFixed(4),
    non_meat_cost: h.breakdown.non_meat_total != null ? h.breakdown.non_meat_total.toFixed(4) : '',
    variant: `${h.variant.patty_type}/${h.variant.patty_size}/${h.variant.blend_source}/${h.variant.scope}`,
  }));

  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=burger-benchmark-export.csv');
  res.send(csv);
});

module.exports = router;
