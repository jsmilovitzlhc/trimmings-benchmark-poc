const express = require('express');
const cors = require('cors');
const db = require('../server/db');
const apiRoutes = require('../server/routes/api');

const app = express();
app.use(cors());
app.use(express.json());

let initialized = false;

app.use(async (req, res, next) => {
  if (!initialized) {
    await db.initialize();
    initialized = true;
  }
  next();
});

app.use('/', apiRoutes);

module.exports = app;
