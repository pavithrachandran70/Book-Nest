const express = require('express');
const { initDb } = require('./db');
const healthRouter = require('./routes/health');

initDb();

const app = express();

app.use(express.json());
app.use('/api/health', healthRouter);

module.exports = app;
