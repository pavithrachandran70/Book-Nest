const request = require('supertest');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'booknest.sqlite');

describe('Data persistence across database restart', () => {
  let app;
  let db;
  let appDb;
  let reopenedDb;

  // Routes keep the Database instance created when src/db.js loads.
  // Closing it simulates a restart, so the next test must load a fresh app.
  function loadApp() {
    if (reopenedDb && reopenedDb.open) {
      reopenedDb.close();
    }
    reopenedDb = undefined;

    if (appDb && appDb.open) {
      appDb.close();
    }

    jest.resetModules();
    app = require('../src/app');
    appDb = require('../src/db').db;
    db = appDb;
  }

  // Helper to create a book
  async function createBook(title, author, price, stock) {
    const response = await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send({ title, author, price, stock });
    return response.body;
  }

  // Helper to add item to cart
  async function addToCart(cartId, bookId, quantity) {
    const req = request(app).post('/api/cart/items').send({ bookId, quantity });
    if (cartId) {
      req.set('x-cart-id', cartId.toString());
    }
    const response = await req;
    return response.body;
  }

  // Helper to checkout
  async function checkout(cartId) {
    const response = await request(app)
      .post('/api/checkout')
      .set('x-cart-id', cartId.toString());
    return response.body;
  }

  // Helper to ship order
  async function shipOrder(orderId) {
    const response = await request(app)
      .post(`/api/orders/${orderId}/ship`)
      .set('x-role', 'admin');
    return response.body;
  }

  // Reopen database connection (simulates server restart)
  function reopenDatabase() {
    if (db && typeof db.close === 'function') {
      db.close();
    }
    if (reopenedDb && reopenedDb.open) {
      reopenedDb.close();
    }
    reopenedDb = new Database(dbPath);
    return reopenedDb;
  }

  beforeAll(() => {
    loadApp();
    // Clean slate: delete all rows in foreign key dependency order
    db.prepare('DELETE FROM order_item').run();
    db.prepare('DELETE FROM "order"').run();
    db.prepare('DELETE FROM cart_item').run();
    db.prepare('DELETE FROM cart').run();
    db.prepare('DELETE FROM product').run();
  });

  beforeEach(() => {
    if (!db || !db.open) {
      loadApp();
    }
  });

  afterAll(() => {
    if (reopenedDb && reopenedDb.open) {
      reopenedDb.close();
    }
    if (appDb && appDb.open) {
      appDb.close();
    }
    if (db && db !== appDb && db.open) {
      db.close();
    }
  });

  test('AC-14 part 1: Book data persists across restart', async () => {
    const book = await createBook('Persistent Book', 'Test Author', 19.99, 10);
    const bookId = book.id;

    // Simulate restart
    const newDb = reopenDatabase();

    // Query directly via SQL
    const persistedBook = newDb.prepare('SELECT id, title, author, price, stock FROM product WHERE id = ?').get(bookId);

    expect(persistedBook).toBeDefined();
    expect(persistedBook.title).toBe('Persistent Book');
    expect(persistedBook.author).toBe('Test Author');
    expect(persistedBook.price).toBe(19.99);
    expect(persistedBook.stock).toBe(10);
  });

  test('AC-14 part 2: Cart data persists across restart', async () => {
    // Restore db reference for API calls
    db = new Database(dbPath);
    const book = await createBook('Cart Test Book', 'Author', 12.00, 5);
    const cartData = await addToCart(null, book.id, 2);
    const cartId = cartData.cartId;

    // Simulate restart
    const newDb = reopenDatabase();

    // Query cart and cart_item
    const persistedCart = newDb.prepare('SELECT * FROM cart WHERE id = ?').get(cartId);
    const persistedCartItem = newDb.prepare('SELECT * FROM cart_item WHERE cart_id = ?').get(cartId);

    expect(persistedCart).toBeDefined();
    expect(persistedCart.id).toBe(cartId);

    expect(persistedCartItem).toBeDefined();
    expect(persistedCartItem.cart_id).toBe(cartId);
    expect(persistedCartItem.book_id).toBe(book.id);
    expect(persistedCartItem.quantity).toBe(2);
  });

  test('AC-14 part 3: Order data persists across restart', async () => {
    db = new Database(dbPath);
    const book = await createBook('Order Test Book', 'Author', 10.00, 10);
    const cartData = await addToCart(null, book.id, 3);
    const cartId = cartData.cartId;
    const order = await checkout(cartId);
    const orderId = order.id;

    // Simulate restart
    const newDb = reopenDatabase();

    // Query order and order_item
    const persistedOrder = newDb.prepare('SELECT * FROM "order" WHERE id = ?').get(orderId);
    const persistedOrderItem = newDb.prepare('SELECT * FROM order_item WHERE order_id = ?').get(orderId);

    expect(persistedOrder).toBeDefined();
    expect(persistedOrder.id).toBe(orderId);
    expect(persistedOrder.status).toBe('placed');
    expect(persistedOrder.total).toBe(30.00); // 3 * 10.00

    expect(persistedOrderItem).toBeDefined();
    expect(persistedOrderItem.order_id).toBe(orderId);
    expect(persistedOrderItem.book_id).toBe(book.id);
    expect(persistedOrderItem.quantity).toBe(3);
    expect(persistedOrderItem.price).toBe(10.00);
  });

  test('AC-14 part 4: Stock reduction persists across restart', async () => {
    db = new Database(dbPath);
    const book = await createBook('Stock Test Book', 'Author', 10.00, 10);
    const cartData = await addToCart(null, book.id, 3);
    const cartId = cartData.cartId;
    await checkout(cartId);

    // Simulate restart
    const newDb = reopenDatabase();

    // Query product stock
    const persistedBook = newDb.prepare('SELECT stock FROM product WHERE id = ?').get(book.id);

    expect(persistedBook).toBeDefined();
    expect(persistedBook.stock).toBe(7); // 10 - 3
  });

  test('AC-14 part 5: Order status "shipped" persists across restart', async () => {
    db = new Database(dbPath);
    const book = await createBook('Ship Test Book', 'Author', 15.00, 5);
    const cartData = await addToCart(null, book.id, 1);
    const cartId = cartData.cartId;
    const order = await checkout(cartId);
    const orderId = order.id;
    await shipOrder(orderId);

    // Simulate restart
    const newDb = reopenDatabase();

    // Query order status
    const persistedOrder = newDb.prepare('SELECT status FROM "order" WHERE id = ?').get(orderId);

    expect(persistedOrder).toBeDefined();
    expect(persistedOrder.status).toBe('shipped');
  });
});
