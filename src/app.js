const express = require('express');
const { initDb } = require('./db');
const { roleReader } = require('./middleware/role');
const healthRouter = require('./routes/health');
const booksRouter = require('./routes/books');
const cartRouter = require('./routes/cart');
const checkoutRouter = require('./routes/checkout');
const ordersRouter = require('./routes/orders');

initDb();

const app = express();

app.use(express.json());
app.use(roleReader);
app.use('/api/health', healthRouter);
app.use('/api/books', booksRouter);
app.use('/api/cart', cartRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/orders', ordersRouter);

module.exports = app;
