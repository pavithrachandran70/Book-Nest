const express = require('express');
const { initDb } = require('./db');
const { roleReader } = require('./middleware/role');
const healthRouter = require('./routes/health');
const booksRouter = require('./routes/books');

initDb();

const app = express();

app.use(express.json());
app.use(roleReader);
app.use('/api/health', healthRouter);
app.use('/api/books', booksRouter);

module.exports = app;
