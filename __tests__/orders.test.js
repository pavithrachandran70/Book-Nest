const request = require('supertest');
const app = require('../src/app');
const { db } = require('../src/db');

describe('Order shipping endpoint and role enforcement', () => {
  async function createBook(title, author, price, stock) {
    const response = await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send({ title, author, price, stock });
    return response.body;
  }

  function createOrder(bookId, quantity, price) {
    const total = quantity * price;
    const result = db
      .prepare('INSERT INTO "order" (status, total) VALUES (?, ?)')
      .run('placed', total);
    const orderId = Number(result.lastInsertRowid);
    db.prepare(
      'INSERT INTO order_item (order_id, book_id, quantity, price) VALUES (?, ?, ?, ?)'
    ).run(orderId, bookId, quantity, price);
    return orderId;
  }

  beforeEach(() => {
    db.prepare('DELETE FROM order_item').run();
    db.prepare('DELETE FROM "order"').run();
    db.prepare('DELETE FROM cart_item').run();
    db.prepare('DELETE FROM cart').run();
    db.prepare('DELETE FROM product').run();
  });

  afterAll(() => {
    db.close();
  });

  test('AC-12: Admin ship order returns 200 with status "shipped"', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);
    const orderId = createOrder(book.id, 2, 10.00);

    const response = await request(app)
      .post(`/api/orders/${orderId}/ship`)
      .set('x-role', 'admin');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: orderId,
      status: 'shipped',
      total: 20.00,
      createdAt: expect.any(String)
    });
  });

  test('AC-12 part 2: Order status persists in database', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);
    const orderId = createOrder(book.id, 2, 10.00);

    await request(app)
      .post(`/api/orders/${orderId}/ship`)
      .set('x-role', 'admin');

    const order = db.prepare('SELECT status FROM "order" WHERE id = ?').get(orderId);

    expect(order.status).toBe('shipped');
  });

  test('AC-13: Shopper ship order returns 403', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);
    const orderId = createOrder(book.id, 2, 10.00);

    const response = await request(app)
      .post(`/api/orders/${orderId}/ship`)
      .set('x-role', 'shopper');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Admin role required' });
  });

  test('Ship nonexistent order returns 404', async () => {
    const response = await request(app)
      .post('/api/orders/999/ship')
      .set('x-role', 'admin');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Order not found' });
  });

  test('Multi-item checkout creates order with multiple order_item rows', async () => {
    const bookA = await createBook('Book A', 'Author 1', 10.00, 5);
    const bookB = await createBook('Book B', 'Author 2', 15.00, 3);

    const cartData = await request(app)
      .post('/api/cart/items')
      .send({ bookId: bookA.id, quantity: 2 });

    const cartId = cartData.body.cartId;

    await request(app)
      .post('/api/cart/items')
      .set('x-cart-id', cartId.toString())
      .send({ bookId: bookB.id, quantity: 1 });

    const response = await request(app)
      .post('/api/checkout')
      .set('x-cart-id', cartId.toString());

    expect(response.status).toBe(201);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.total).toBe(35.00); // 2*10 + 1*15

    const orderId = response.body.id;
    const orderItemCount = db.prepare('SELECT COUNT(*) as count FROM order_item WHERE order_id = ?').get(orderId).count;
    expect(orderItemCount).toBe(2);

    const bookAResponse = await request(app).get(`/api/books/${bookA.id}`);
    expect(bookAResponse.body.stock).toBe(3); // 5 - 2

    const bookBResponse = await request(app).get(`/api/books/${bookB.id}`);
    expect(bookBResponse.body.stock).toBe(2); // 3 - 1
  });

  test('AC-14: Persistence across restart (order and stock)', async () => {
    const book = await createBook('Persist Test', 'Author', 10.00, 10);
    const cartData = await request(app)
      .post('/api/cart/items')
      .send({ bookId: book.id, quantity: 3 });

    const cartId = cartData.body.cartId;

    const checkoutResponse = await request(app)
      .post('/api/checkout')
      .set('x-cart-id', cartId.toString());

    const orderId = checkoutResponse.body.id;

    // Simulate restart by closing and reopening database
    db.close();
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(__dirname, '..', 'data', 'booknest.sqlite');
    const reopenedDb = new Database(dbPath);

    const orderCount = reopenedDb.prepare('SELECT COUNT(*) as count FROM "order"').get().count;
    expect(orderCount).toBe(1);

    const persistedStock = reopenedDb.prepare('SELECT stock FROM product WHERE id = ?').get(book.id).stock;
    expect(persistedStock).toBe(7); // 10 - 3

    const persistedStatus = reopenedDb.prepare('SELECT status FROM "order" WHERE id = ?').get(orderId).status;
    expect(persistedStatus).toBe('placed');

    reopenedDb.close();
  });
});
