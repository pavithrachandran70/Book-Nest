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

function getCartIdFromHeader(req) {
  const raw = req.headers['x-cart-id'];
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  return parsePositiveInt(Number(raw));
}

router.post('/items', (req, res) => {
  const { bookId, quantity } = req.body || {};

  if (!Number.isInteger(bookId) || bookId <= 0) {
    return res.status(400).json({ error: 'Invalid book ID' });
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive integer' });
  }

  const book = db
    .prepare('SELECT id, title, author, price, stock FROM product WHERE id = ?')
    .get(bookId);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const headerCartId = getCartIdFromHeader(req);
  let cartId = headerCartId;

  if (cartId !== null) {
    const cart = db.prepare('SELECT id FROM cart WHERE id = ?').get(cartId);
    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }
  }

  const existingItem =
    cartId === null
      ? null
      : db
          .prepare('SELECT quantity FROM cart_item WHERE cart_id = ? AND book_id = ?')
          .get(cartId, bookId);

  const existingQuantity = existingItem ? existingItem.quantity : 0;
  const newQuantity = existingQuantity + quantity;

  if (newQuantity > book.stock) {
    return res.status(400).json({ error: 'Requested quantity exceeds available stock' });
  }

  if (cartId === null) {
    const result = db.prepare('INSERT INTO cart DEFAULT VALUES').run();
    cartId = Number(result.lastInsertRowid);
  }

  if (existingItem) {
    db.prepare('UPDATE cart_item SET quantity = ? WHERE cart_id = ? AND book_id = ?').run(
      newQuantity,
      cartId,
      bookId
    );
  } else {
    db.prepare('INSERT INTO cart_item (cart_id, book_id, quantity) VALUES (?, ?, ?)').run(
      cartId,
      bookId,
      newQuantity
    );
  }

  return res.status(201).json({
    cartId,
    bookId,
    quantity: newQuantity
  });
});

router.get('/', (req, res) => {
  const raw = req.headers['x-cart-id'];
  if (raw === undefined || raw === null || raw === '') {
    return res.status(400).json({ error: 'Cart ID required' });
  }

  const cartId = parsePositiveInt(Number(raw));
  if (cartId === null) {
    return res.status(400).json({ error: 'Cart ID required' });
  }

  const cart = db.prepare('SELECT id FROM cart WHERE id = ?').get(cartId);
  if (!cart) {
    return res.status(404).json({ error: 'Cart not found' });
  }

  const rows = db
    .prepare(
      `SELECT
         ci.book_id AS bookId,
         p.title AS title,
         p.author AS author,
         ci.quantity AS quantity,
         p.price AS price
       FROM cart_item ci
       JOIN product p ON p.id = ci.book_id
       WHERE ci.cart_id = ?
       ORDER BY ci.book_id ASC`
    )
    .all(cartId);

  const items = rows.map((row) => ({
    bookId: row.bookId,
    title: row.title,
    author: row.author,
    quantity: row.quantity,
    price: row.price,
    lineTotal: row.quantity * row.price
  }));

  return res.status(200).json({
    cartId,
    items
  });
});

router.delete('/items/:bookId', (req, res) => {
  const raw = req.headers['x-cart-id'];
  if (raw === undefined || raw === null || raw === '') {
    return res.status(400).json({ error: 'Cart ID required' });
  }

  const cartId = parsePositiveInt(Number(raw));
  if (cartId === null) {
    return res.status(400).json({ error: 'Cart ID required' });
  }

  const cart = db.prepare('SELECT id FROM cart WHERE id = ?').get(cartId);
  if (!cart) {
    return res.status(404).json({ error: 'Cart not found' });
  }

  const bookId = parsePositiveInt(Number(req.params.bookId));
  if (bookId === null) {
    return res.status(404).json({ error: 'Item not found in cart' });
  }

  const item = db
    .prepare('SELECT cart_id FROM cart_item WHERE cart_id = ? AND book_id = ?')
    .get(cartId, bookId);

  if (!item) {
    return res.status(404).json({ error: 'Item not found in cart' });
  }

  db.prepare('DELETE FROM cart_item WHERE cart_id = ? AND book_id = ?').run(cartId, bookId);

  return res.status(200).json({ message: 'Item removed' });
});

module.exports = router;
