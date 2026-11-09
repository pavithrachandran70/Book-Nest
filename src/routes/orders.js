const express = require('express');
const { db } = require('../db');
const { requireAdmin } = require('../middleware/role');

const router = express.Router();

router.post('/:id/ship', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const order = db
    .prepare('SELECT id, status, total, created_at AS createdAt FROM "order" WHERE id = ?')
    .get(id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  db.prepare('UPDATE "order" SET status = ? WHERE id = ?').run('shipped', id);

  return res.status(200).json({
    id: order.id,
    status: 'shipped',
    total: order.total,
    createdAt: order.createdAt
  });
});

module.exports = router;
