const express = require('express');
const { db } = require('../db');

const router = express.Router();

function parsePositiveInt(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return null;
  }
  return n;
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const performCheckout = db.transaction((cartId) => {
  const cart = db.prepare('SELECT id FROM cart WHERE id = ?').get(cartId);
  if (!cart) {
    throw new HttpError(404, 'Cart not found');
  }

  const lines = db
    .prepare(
      `SELECT
         ci.book_id AS bookId,
         ci.quantity AS quantity,
         p.price AS price,
         p.stock AS stock
       FROM cart_item ci
       JOIN product p ON p.id = ci.book_id
       WHERE ci.cart_id = ?
       ORDER BY ci.book_id ASC`
    )
    .all(cartId);

  if (lines.length === 0) {
    throw new HttpError(400, 'Cart is empty');
  }

  for (const line of lines) {
    if (line.quantity > line.stock) {
      throw new HttpError(400, 'Insufficient stock');
    }
  }

  const total = lines.reduce((sum, line) => sum + line.quantity * line.price, 0);

  const orderResult = db
    .prepare('INSERT INTO "order" (status, total) VALUES (?, ?)')
    .run('placed', total);
  const orderId = Number(orderResult.lastInsertRowid);

  const insertItem = db.prepare(
    'INSERT INTO order_item (order_id, book_id, quantity, price) VALUES (?, ?, ?, ?)'
  );
  const reduceStock = db.prepare(
    'UPDATE product SET stock = stock - ? WHERE id = ? AND stock >= ?'
  );

  for (const line of lines) {
    insertItem.run(orderId, line.bookId, line.quantity, line.price);
    const updated = reduceStock.run(line.quantity, line.bookId, line.quantity);
    if (updated.changes !== 1) {
      throw new HttpError(400, 'Insufficient stock');
    }
  }

  db.prepare('DELETE FROM cart_item WHERE cart_id = ?').run(cartId);

  const order = db
    .prepare('SELECT id, status, total, created_at AS createdAt FROM "order" WHERE id = ?')
    .get(orderId);

  const items = db
    .prepare(
      'SELECT book_id AS bookId, quantity, price FROM order_item WHERE order_id = ? ORDER BY book_id ASC'
    )
    .all(orderId);

  return {
    id: order.id,
    status: order.status,
    total: order.total,
    createdAt: order.createdAt,
    items
  };
});

router.post('/', (req, res) => {
  const raw = req.headers['x-cart-id'];
  if (raw === undefined || raw === null || raw === '') {
    return res.status(400).json({ error: 'Cart ID required' });
  }

  const cartId = parsePositiveInt(Number(raw));
  if (cartId === null) {
    return res.status(400).json({ error: 'Cart ID required' });
  }

  try {
    const order = performCheckout(cartId);
    return res.status(201).json(order);
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    throw err;
  }
});

module.exports = router;
