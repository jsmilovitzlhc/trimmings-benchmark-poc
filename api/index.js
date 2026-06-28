const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

let initDone = false;
let initPromise = null;

async function ensureInit() {
  if (initDone) return;
  if (!initPromise) {
    initPromise = require('../server/db').initialize();
  }
  await initPromise;
  initDone = true;
}

app.all('*', async (req, res, next) => {
  try {
    await ensureInit();
    next();
  } catch (e) {
    res.status(500).json({ error: 'DB init failed: ' + e.message });
  }
});

app.use('/api', require('../server/routes/api'));

module.exports = app;
