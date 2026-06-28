const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'trimmings.db');

let _db = null;
let _ready = null;

function getDb() {
  if (!_db) throw new Error('Database not initialized. Call initialize() first.');
  return _db;
}

function save() {
  if (_db) {
    try {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
    } catch (e) {
      // Read-only filesystem (Vercel) — data stays in memory only
    }
  }
}

async function initialize() {
  if (_ready) return _ready;
  _ready = (async () => {
    // Try multiple paths for the WASM file (local dev vs Vercel)
    const wasmCandidates = [
      path.join(__dirname, '..', 'api', 'sql-wasm.wasm'),
      path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    ];
    let wasmBinary;
    for (const p of wasmCandidates) {
      try {
        wasmBinary = fs.readFileSync(p);
        break;
      } catch {}
    }
    const SQL = await initSqlJs({ wasmBinary });
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

    if (fs.existsSync(DB_PATH)) {
      const buf = fs.readFileSync(DB_PATH);
      _db = new SQL.Database(buf);
    } else {
      _db = new SQL.Database();
    }

    _db.run(`
      CREATE TABLE IF NOT EXISTS series (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK(source_type IN ('raw', 'derived')),
        description TEXT,
        is_active INTEGER DEFAULT 1
      )
    `);
    _db.run(`
      CREATE TABLE IF NOT EXISTS assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        series_id TEXT NOT NULL REFERENCES series(id),
        date TEXT NOT NULL,
        value REAL NOT NULL,
        low REAL,
        high REAL,
        volume REAL,
        data_source TEXT NOT NULL DEFAULT 'historical',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(series_id, date)
      )
    `);
    _db.run(`
      CREATE TABLE IF NOT EXISTS contributors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        company TEXT,
        is_active INTEGER DEFAULT 1,
        is_synthetic INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    _db.run(`
      CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contributor_id TEXT NOT NULL REFERENCES contributors(id),
        series_id TEXT NOT NULL REFERENCES series(id),
        date TEXT NOT NULL,
        price REAL NOT NULL,
        volume REAL,
        unit TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'outlier')),
        submitted_at TEXT DEFAULT (datetime('now')),
        notes TEXT
      )
    `);
    _db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        actor TEXT,
        details TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    _db.run(`
      CREATE TABLE IF NOT EXISTS assessment_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        series_id TEXT NOT NULL REFERENCES series(id),
        date TEXT NOT NULL,
        method TEXT NOT NULL DEFAULT 'vwap',
        input_trade_count INTEGER,
        outlier_count INTEGER,
        result_value REAL,
        config TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    try { _db.run('CREATE INDEX IF NOT EXISTS idx_assessments_series_date ON assessments(series_id, date)'); } catch {}
    try { _db.run('CREATE INDEX IF NOT EXISTS idx_trades_series_date ON trades(series_id, date)'); } catch {}
    try { _db.run('CREATE INDEX IF NOT EXISTS idx_trades_contributor ON trades(contributor_id)'); } catch {}
    try { _db.run('CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)'); } catch {}

    // Seed series if empty
    const [{ c }] = queryAll('SELECT count(*) as c FROM series');
    if (c === 0) {
      // Try loading from snapshot first
      const snapshotPath = path.join(__dirname, '..', 'data', 'snapshot.json');
      if (fs.existsSync(snapshotPath)) {
        console.log('Loading from snapshot...');
        const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
        for (const s of snapshot.series) {
          _db.run("INSERT OR REPLACE INTO series (id, name, unit, source_type, description, is_active) VALUES (?, ?, ?, ?, ?, ?)",
            [s.id, s.name, s.unit, s.source_type, s.description, s.is_active]);
        }
        for (const a of snapshot.assessments) {
          _db.run("INSERT OR REPLACE INTO assessments (series_id, date, value, low, high, volume, data_source) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [a.series_id, a.date, a.value, a.low, a.high, a.volume, a.data_source]);
        }
        for (const c of snapshot.contributors) {
          _db.run("INSERT OR REPLACE INTO contributors (id, name, company, is_active, is_synthetic) VALUES (?, ?, ?, ?, ?)",
            [c.id, c.name, c.company, c.is_active, c.is_synthetic]);
        }
        for (const t of snapshot.trades) {
          _db.run("INSERT INTO trades (contributor_id, series_id, date, price, volume, unit, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [t.contributor_id, t.series_id, t.date, t.price, t.volume, t.unit, t.status, t.notes]);
        }
        console.log(`Loaded snapshot: ${snapshot.assessments.length} assessments, ${snapshot.trades.length} trades`);
      } else {
        _db.run("INSERT INTO series (id, name, unit, source_type, description) VALUES ('domestic_90cl', 'MP Domestic 90CL', '$/cwt', 'raw', 'Domestic boneless beef trimmings, 90% chemical lean')");
        _db.run("INSERT INTO series (id, name, unit, source_type, description) VALUES ('domestic_50cl', 'MP Domestic 50CL', '$/cwt', 'raw', 'Domestic boneless beef trimmings, 50% lean')");
        _db.run("INSERT INTO series (id, name, unit, source_type, description) VALUES ('imported_90cl', 'MP Imported 90CL', '$/lb', 'raw', 'Imported boneless beef trimmings, 90% chemical lean')");
        _db.run("INSERT INTO series (id, name, unit, source_type, description) VALUES ('75cl_meatblock', 'MP 75CL Meat-Block', '$/cwt', 'derived', 'Derived 75CL blend from 90CL/50CL at configured ratio')");
        _db.run("INSERT INTO series (id, name, unit, source_type, description) VALUES ('trim_spread', 'MP Trim Spread', '$/cwt', 'derived', 'Domestic 90CL minus Imported 90CL, unit-normalized')");
      }
    }

    try { save(); } catch (e) { console.log('Read-only filesystem, running in-memory only'); }
    console.log(`Database initialized (${c > 0 ? 'from disk' : 'fresh'})`);
  })();
  return _ready;
}

function queryAll(sql, params = []) {
  const stmt = _db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

function run(sql, params = []) {
  _db.run(sql, params);
  save();
  return { lastInsertRowid: _db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] };
}

function runNoSave(sql, params = []) {
  _db.run(sql, params);
}

module.exports = { getDb, initialize, queryAll, queryOne, run, runNoSave, save };
