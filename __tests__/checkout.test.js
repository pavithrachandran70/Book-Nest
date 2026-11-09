const request = require('supertest');
const app = require('../src/app');
const { db } = require('../src/db');

describe('Checkout endpoint and stock reduction', () => {
  async function createBook(title, author, price, stock) {
    const response = await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send({ title, author, price, stock });
    return response.body;
  }

  async function addToCart(cartId, bookId, quantity) {
    const req = request(app).post('/api/cart/items').send({ bookId, quantity });
    if (cartId) {
      req.set('x-cart-id', cartId.toString());
    }
    const response = await req;
    return response.body;
  }

  async function getCart(cartId) {
    const response = await request(app)
      .get('/api/cart')
      .set('x-cart-id', cartId.toString());
    return response.body;
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

  test('AC-10 part 1: Successful checkout returns 201 with order', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);
    const cartData = await addToCart(null, book.id, 2);
    const cartId = cartData.cartId;

    const response = await request(app)
      .post('/api/checkout')
      .set('x-cart-id', cartId.toString());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.any(Number),
      status: 'placed',
      total: 20.00,
      createdAt: expect.any(String)
    });
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      bookId: book.id,
      quantity: 2,
      price: 10.00
    });
  });

  test('AC-10 part 2: Cart is empty after checkout', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);
    const cartData = await addToCart(null, book.id, 2);
    const cartId = cartData.cartId;

    await request(app)
      .post('/api/checkout')
      .set('x-cart-id', cartId.toString());

    const cartResponse = await request(app)
      .get('/api/cart')
      .set('x-cart-id', cartId.toString());

    expect(cartResponse.status).toBe(200);
    expect(cartResponse.body.items).toHaveLength(0);
  });

  test('AC-10 part 3: Stock is reduced after checkout', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);
    const cartData = await addToCart(null, book.id, 2);
    const cartId = cartData.cartId;

    await request(app)
      .post('/api/checkout')
      .set('x-cart-id', cartId.toString());

    const bookResponse = await request(app).get(`/api/books/${book.id}`);

    expect(bookResponse.status).toBe(200);
    expect(bookResponse.body.stock).toBe(3);
  });

  test('AC-10 part 4: order_item captures price at checkout time', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);
    const cartData = await addToCart(null, book.id, 2);
    const cartId = cartData.cartId;

    const checkoutResponse = await request(app)
      .post('/api/checkout')
      .set('x-cart-id', cartId.toString());

    const orderId = checkoutResponse.body.id;

    const orderItem = db.prepare('SELECT quantity, price FROM order_item WHERE order_id = ?').get(orderId);

    expect(orderItem).toMatchObject({
      quantity: 2,
      price: 10.00
    });
  });

  test('AC-11 part 1: Checkout with quantity > stock returns 400', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 3);
    const cartData = await addToCart(null, book.id, 2);
    const cartId = cartData.cartId;

    // Manually reduce stock to simulate race condition
    db.prepare('UPDATE product SET stock = ? WHERE id = ?').run(1, book.id);

    const response = await request(app)
      .post('/api/checkout')
      .set('x-cart-id', cartId.toString());

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Insufficient stock/);
  });

  test('AC-11 part 2: Stock unchanged after failed checkout', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 3);
    const cartData = await addToCart(null, book.id, 2);
    const cartId = cartData.cartId;

    db.prepare('UPDATE product SET stock = ? WHERE id = ?').run(1, book.id);

    await request(app)
      .post('/api/checkout')
      .set('x-cart-id', cartId.toString());

    const bookResponse = await request(app).get(`/api/books/${book.id}`);

    expect(bookResponse.status).toBe(200);
    expect(bookResponse.body.stock).toBe(1);
  });

  test('AC-11 part 3: No order created after failed checkout', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 3);
    const cartData = await addToCart(null, book.id, 2);
    const cartId = cartData.cartId;

    db.prepare('UPDATE product SET stock = ? WHERE id = ?').run(1, book.id);

    await request(app)
      .post('/api/checkout')
      .set('x-cart-id', cartId.toString());

    const orderCount = db.prepare('SELECT COUNT(*) as count FROM "order"').get().count;

    expect(orderCount).toBe(0);
  });

  test('Checkout with empty cart returns 400', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);
    const cartData = await addToCart(null, book.id, 1);
    const cartId = cartData.cartId;

    // Delete the cart item
    await request(app)
      .delete(`/api/cart/items/${book.id}`)
      .set('x-cart-id', cartId.toString());

    const response = await request(app)
      .post('/api/checkout')
      .set('x-cart-id', cartId.toString());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Cart is empty' });
  });
});
