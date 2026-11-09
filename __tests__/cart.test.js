const request = require('supertest');
const app = require('../src/app');
const { db } = require('../src/db');

describe('Cart operations and stock validation', () => {
  // Helper to create a book (admin role)
  async function createBook(title, author, price, stock) {
    const response = await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send({ title, author, price, stock });
    return response.body;
  }

  beforeEach(() => {
    db.prepare('DELETE FROM cart_item').run();
    db.prepare('DELETE FROM cart').run();
    db.prepare('DELETE FROM product').run();
  });

  afterAll(() => {
    db.close();
  });

  test('AC-6 part 1: Add book to new cart returns 201 with cartId', async () => {
    const book = await createBook('Test Book', 'Test Author', 12.99, 5);

    const response = await request(app)
      .post('/api/cart/items')
      .send({ bookId: book.id, quantity: 2 });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      cartId: expect.any(Number),
      bookId: book.id,
      quantity: 2
    });
  });

  test('AC-6 part 2: GET /api/cart shows line with price and lineTotal', async () => {
    const book = await createBook('Test Book', 'Test Author', 12.99, 5);

    const addResponse = await request(app)
      .post('/api/cart/items')
      .send({ bookId: book.id, quantity: 2 });

    const cartId = addResponse.body.cartId;

    const getResponse = await request(app)
      .get('/api/cart')
      .set('x-cart-id', cartId.toString());

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.cartId).toBe(cartId);
    expect(getResponse.body.items).toHaveLength(1);
    expect(getResponse.body.items[0]).toMatchObject({
      bookId: book.id,
      title: 'Test Book',
      author: 'Test Author',
      quantity: 2,
      price: 12.99,
      lineTotal: 25.98
    });
  });

  test('AC-7: Add same book again increments quantity', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);

    const addResponse1 = await request(app)
      .post('/api/cart/items')
      .send({ bookId: book.id, quantity: 2 });

    const cartId = addResponse1.body.cartId;

    const addResponse2 = await request(app)
      .post('/api/cart/items')
      .set('x-cart-id', cartId.toString())
      .send({ bookId: book.id, quantity: 1 });

    expect(addResponse2.status).toBe(201);
    expect(addResponse2.body.quantity).toBe(3);

    const getResponse = await request(app)
      .get('/api/cart')
      .set('x-cart-id', cartId.toString());

    expect(getResponse.body.items).toHaveLength(1);
    expect(getResponse.body.items[0].quantity).toBe(3);
    expect(getResponse.body.items[0].lineTotal).toBe(30.00);
  });

  test('AC-8 part 1: Add quantity > stock returns 400', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);

    const addResponse1 = await request(app)
      .post('/api/cart/items')
      .send({ bookId: book.id, quantity: 2 });

    const cartId = addResponse1.body.cartId;

    const addResponse2 = await request(app)
      .post('/api/cart/items')
      .set('x-cart-id', cartId.toString())
      .send({ bookId: book.id, quantity: 4 });

    expect(addResponse2.status).toBe(400);
    expect(addResponse2.body).toEqual({ error: 'Requested quantity exceeds available stock' });
  });

  test('AC-8 part 2: Cart unchanged after validation failure', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);

    const addResponse1 = await request(app)
      .post('/api/cart/items')
      .send({ bookId: book.id, quantity: 2 });

    const cartId = addResponse1.body.cartId;

    await request(app)
      .post('/api/cart/items')
      .set('x-cart-id', cartId.toString())
      .send({ bookId: book.id, quantity: 4 });

    const getResponse = await request(app)
      .get('/api/cart')
      .set('x-cart-id', cartId.toString());

    expect(getResponse.body.items).toHaveLength(1);
    expect(getResponse.body.items[0].quantity).toBe(2);
  });

  test('Add quantity > stock in fresh cart returns 400, no cart created', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);

    const response = await request(app)
      .post('/api/cart/items')
      .send({ bookId: book.id, quantity: 10 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Requested quantity exceeds available stock' });

    const cartCount = db.prepare('SELECT COUNT(*) as count FROM cart').get().count;
    expect(cartCount).toBe(0);
  });

  test('AC-9: DELETE /api/cart/items/:bookId removes line', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);

    const addResponse = await request(app)
      .post('/api/cart/items')
      .send({ bookId: book.id, quantity: 2 });

    const cartId = addResponse.body.cartId;

    const deleteResponse = await request(app)
      .delete(`/api/cart/items/${book.id}`)
      .set('x-cart-id', cartId.toString());

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ message: 'Item removed' });

    const getResponse = await request(app)
      .get('/api/cart')
      .set('x-cart-id', cartId.toString());

    expect(getResponse.body.items).toHaveLength(0);
  });

  test('POST without x-cart-id creates new cart', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);

    const response1 = await request(app)
      .post('/api/cart/items')
      .send({ bookId: book.id, quantity: 1 });

    const cartId1 = response1.body.cartId;

    const response2 = await request(app)
      .post('/api/cart/items')
      .send({ bookId: book.id, quantity: 1 });

    const cartId2 = response2.body.cartId;

    expect(cartId1).not.toBe(cartId2);
  });

  test('GET /api/cart with no x-cart-id returns 400', async () => {
    const response = await request(app).get('/api/cart');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Cart ID required' });
  });

  test('GET /api/cart with nonexistent cartId returns 404', async () => {
    const response = await request(app)
      .get('/api/cart')
      .set('x-cart-id', '999');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Cart not found' });
  });

  test('DELETE with nonexistent bookId returns 404', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);

    const addResponse = await request(app)
      .post('/api/cart/items')
      .send({ bookId: book.id, quantity: 1 });

    const cartId = addResponse.body.cartId;

    const response = await request(app)
      .delete('/api/cart/items/999')
      .set('x-cart-id', cartId.toString());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Item not found in cart' });
  });

  test('POST with invalid bookId returns 400', async () => {
    const response = await request(app)
      .post('/api/cart/items')
      .send({ bookId: -1, quantity: 1 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid book ID' });
  });

  test('POST with invalid quantity returns 400', async () => {
    const book = await createBook('Test Book', 'Test Author', 10.00, 5);

    const response = await request(app)
      .post('/api/cart/items')
      .send({ bookId: book.id, quantity: 0 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Quantity must be a positive integer' });
  });

  test('POST with nonexistent bookId returns 404', async () => {
    const response = await request(app)
      .post('/api/cart/items')
      .send({ bookId: 999, quantity: 1 });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Book not found' });
  });
});
