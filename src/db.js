const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'booknest.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

function initDb() {
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS product (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cart (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cart_item (
      cart_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      PRIMARY KEY (cart_id, book_id),
      FOREIGN KEY (cart_id) REFERENCES cart(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES product(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "order" (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'placed',
      total REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_item (
      order_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      PRIMARY KEY (order_id, book_id),
      FOREIGN KEY (order_id) REFERENCES "order"(id) ON DELETE CASCADE
    );
  `);
}

initDb();

const nativeClose = db.close.bind(db);
db.close = function close() {
  if (db.open) {
    nativeClose();
  }
};

module.exports = { db, initDb };
