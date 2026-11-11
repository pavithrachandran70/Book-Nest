const express = require('express');
const db = require('../db');

const router = express.Router();

const ALLOWED_ROLES = new Set(['shopper', 'admin']);

function toIso8601(value) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    const numeric = Number(value);
    const millis = numeric < 1e12 ? numeric * 1000 : numeric;
    return new Date(millis).toISOString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString();
}

function toMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

router.get('/:id', (req, res) => {
  const role = req.headers['x-role'];
  if (!ALLOWED_ROLES.has(role)) {
    return res.status(403).json({ error: 'Invalid role' });
  }

  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const rows = db.prepare(`
    SELECT
      o.id,
      o.status,
      o.total,
      o.createdAt,
      oi.bookId,
      oi.quantity,
      oi.price
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.orderId
    WHERE o.id = ?
  `).all(orderId);

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const order = {
    id: rows[0].id,
    status: rows[0].status,
    total: toMoney(rows[0].total),
    createdAt: toIso8601(rows[0].createdAt),
    items: rows
      .filter((row) => row.bookId !== null)
      .map((row) => ({
        bookId: row.bookId,
        quantity: row.quantity,
        price: toMoney(row.price),
      })),
  };

  return res.status(200).json(order);
});

module.exports = router;
