process.env.DB_PATH = ':memory:';

const request = require('supertest');
const app = require('../server');
const db = require('../db');

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function seedOrder({ id, status, total, createdAt, items = [] }) {
  db.prepare(
    'INSERT INTO orders (id, status, total, createdAt) VALUES (?, ?, ?, ?)'
  ).run(id, status, total, createdAt);

  const insertItem = db.prepare(
    'INSERT INTO order_items (orderId, bookId, quantity, price) VALUES (?, ?, ?, ?)'
  );
  for (const item of items) {
    insertItem.run(id, item.bookId, item.quantity, item.price);
  }
}

describe('GET /api/orders/:id', () => {
  beforeEach(() => {
    db.exec('DELETE FROM order_items; DELETE FROM orders;');
  });

  test('AC-1: Retrieve an existing order with all fields', async () => {
    const createdAt = '2025-01-15T10:30:00.000Z';
    seedOrder({
      id: 123,
      status: 'placed',
      total: 29.97,
      createdAt,
      items: [
        { bookId: 1, quantity: 2, price: 9.99 },
        { bookId: 2, quantity: 1, price: 9.99 },
        { bookId: 3, quantity: 1, price: 9.99 },
      ],
    });

    const response = await request(app)
      .get('/api/orders/123')
      .set('x-role', 'shopper');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 123,
      status: 'placed',
      total: 29.97,
      createdAt,
      items: [
        { bookId: 1, quantity: 2, price: 9.99 },
        { bookId: 2, quantity: 1, price: 9.99 },
        { bookId: 3, quantity: 1, price: 9.99 },
      ],
    });
    expect(response.body.items).toHaveLength(3);
  });

  test('AC-2: Retrieve a shipped order', async () => {
    seedOrder({
      id: 456,
      status: 'shipped',
      total: 9.99,
      createdAt: '2025-02-01T08:00:00.000Z',
      items: [{ bookId: 4, quantity: 1, price: 9.99 }],
    });

    const response = await request(app)
      .get('/api/orders/456')
      .set('x-role', 'admin');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('shipped');
  });

  test('AC-3: Return 404 for unknown order id', async () => {
    const response = await request(app)
      .get('/api/orders/999')
      .set('x-role', 'shopper');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Order not found' });
  });

  test('AC-4: Admin role can retrieve an order', async () => {
    const createdAt = '2025-03-01T12:00:00.000Z';
    seedOrder({
      id: 789,
      status: 'placed',
      total: 9.99,
      createdAt,
      items: [{ bookId: 5, quantity: 1, price: 9.99 }],
    });

    const response = await request(app)
      .get('/api/orders/789')
      .set('x-role', 'admin');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 789,
      status: 'placed',
      total: 9.99,
      createdAt,
      items: [{ bookId: 5, quantity: 1, price: 9.99 }],
    });
  });

  test('AC-5: Shopper role can retrieve an order', async () => {
    const createdAt = '2025-03-01T12:00:00.000Z';
    seedOrder({
      id: 789,
      status: 'placed',
      total: 9.99,
      createdAt,
      items: [{ bookId: 5, quantity: 1, price: 9.99 }],
    });

    const response = await request(app)
      .get('/api/orders/789')
      .set('x-role', 'shopper');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 789,
      status: 'placed',
      total: 9.99,
      createdAt,
      items: [{ bookId: 5, quantity: 1, price: 9.99 }],
    });
  });

  test('Edge case: Order with zero items', async () => {
    seedOrder({
      id: 321,
      status: 'placed',
      total: 0,
      createdAt: '2025-04-01T00:00:00.000Z',
      items: [],
    });

    const response = await request(app)
      .get('/api/orders/321')
      .set('x-role', 'shopper');

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  test('Edge case: createdAt is a valid ISO 8601 string', async () => {
    seedOrder({
      id: 654,
      status: 'placed',
      total: 9.99,
      createdAt: '2025-01-15T10:30:00.000Z',
      items: [{ bookId: 1, quantity: 1, price: 9.99 }],
    });

    const response = await request(app)
      .get('/api/orders/654')
      .set('x-role', 'shopper');

    expect(response.status).toBe(200);
    expect(response.body.createdAt).toMatch(ISO_8601);
    expect(new Date(response.body.createdAt).toISOString()).toBe(response.body.createdAt);
  });

  test('Edge case: total and price fields are numbers, not strings', async () => {
    seedOrder({
      id: 111,
      status: 'placed',
      total: 19.98,
      createdAt: '2025-05-01T00:00:00.000Z',
      items: [{ bookId: 7, quantity: 2, price: 9.99 }],
    });

    const response = await request(app)
      .get('/api/orders/111')
      .set('x-role', 'admin');

    expect(response.status).toBe(200);
    expect(typeof response.body.total).toBe('number');
    expect(typeof response.body.items[0].price).toBe('number');
  });
});
