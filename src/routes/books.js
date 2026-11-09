const express = require('express');
const { db } = require('../db');
const { requireAdmin } = require('../middleware/role');

const router = express.Router();

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validateBook(body) {
  const { title, author, price, stock } = body || {};

  if (!isNonEmptyString(title)) {
    return 'Title is required';
  }

  if (!isNonEmptyString(author)) {
    return 'Author is required';
  }

  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return 'Price must be greater than 0';
  }

  if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0) {
    return 'Stock must be a non-negative integer';
  }

  return null;
}

router.post('/', requireAdmin, (req, res) => {
  const error = validateBook(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const title = req.body.title.trim();
  const author = req.body.author.trim();
  const { price, stock } = req.body;

  const result = db
    .prepare('INSERT INTO product (title, author, price, stock) VALUES (?, ?, ?, ?)')
    .run(title, author, price, stock);

  const book = db
    .prepare('SELECT id, title, author, price, stock FROM product WHERE id = ?')
    .get(Number(result.lastInsertRowid));

  return res.status(201).json(book);
});

router.get('/', (req, res) => {
  const books = db
    .prepare('SELECT id, title, author, price, stock FROM product ORDER BY id ASC')
    .all();

  return res.status(200).json(books);
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const book = db
    .prepare('SELECT id, title, author, price, stock FROM product WHERE id = ?')
    .get(id);

  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }

  return res.status(200).json(book);
});

module.exports = router;
