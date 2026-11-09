const express = require('express');
const { initDb } = require('./db');
const { roleReader } = require('./middleware/role');
const healthRouter = require('./routes/health');
const booksRouter = require('./routes/books');
const cartRouter = require('./routes/cart');

initDb();

const app = express();

app.use(express.json());
app.use(roleReader);
app.use('/api/health', healthRouter);
app.use('/api/books', booksRouter);
app.use('/api/cart', cartRouter);

module.exports = app;
