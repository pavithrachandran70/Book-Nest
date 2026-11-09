const request = require('supertest');
const app = require('../src/app');
const { db } = require('../src/db');

describe('Books API and role enforcement', () => {
  beforeEach(() => {
    // Clear product table before each test
    db.prepare('DELETE FROM product').run();
  });

  afterAll(() => {
    db.close();
  });

  test('AC-3 part 1: Admin POST /api/books creates book and returns 201', async () => {
    const bookData = {
      title: 'The Pragmatic Programmer',
      author: 'Hunt & Thomas',
      price: 29.99,
      stock: 10
    };

    const response = await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send(bookData);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.any(Number),
      title: 'The Pragmatic Programmer',
      author: 'Hunt & Thomas',
      price: 29.99,
      stock: 10
    });
  });

  test('AC-3 part 2: GET /api/books/:id returns created book', async () => {
    const bookData = {
      title: 'Clean Code',
      author: 'Robert C. Martin',
      price: 34.99,
      stock: 5
    };

    const createResponse = await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send(bookData);

    const bookId = createResponse.body.id;

    const getResponse = await request(app)
      .get(`/api/books/${bookId}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toMatchObject({
      id: bookId,
      title: 'Clean Code',
      author: 'Robert C. Martin',
      price: 34.99,
      stock: 5
    });
  });

  test('AC-4: Shopper POST /api/books returns 403', async () => {
    const bookData = {
      title: 'Forbidden Book',
      author: 'Unauthorized',
      price: 9.99,
      stock: 1
    };

    const response = await request(app)
      .post('/api/books')
      .set('x-role', 'shopper')
      .send(bookData);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Admin role required' });
  });

  test('No x-role header returns 403', async () => {
    const bookData = {
      title: 'No Role Book',
      author: 'Anonymous',
      price: 5.00,
      stock: 1
    };

    const response = await request(app)
      .post('/api/books')
      .send(bookData);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Admin role required' });
  });

  test('Empty title returns 400', async () => {
    const bookData = {
      title: '',
      author: 'Some Author',
      price: 19.99,
      stock: 3
    };

    const response = await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send(bookData);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Title is required' });
  });

  test('Price = 0 returns 400', async () => {
    const bookData = {
      title: 'Free Book',
      author: 'Giveaway',
      price: 0,
      stock: 100
    };

    const response = await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send(bookData);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Price must be greater than 0' });
  });

  test('Negative stock returns 400', async () => {
    const bookData = {
      title: 'Negative Stock',
      author: 'Error',
      price: 12.00,
      stock: -1
    };

    const response = await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send(bookData);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Stock must be a non-negative integer' });
  });

  test('AC-5: GET /api/books returns array of all books', async () => {
    await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send({ title: 'Book 1', author: 'Author A', price: 10.00, stock: 5 });

    await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send({ title: 'Book 2', author: 'Author B', price: 15.00, stock: 3 });

    const response = await request(app).get('/api/books');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toHaveProperty('id');
    expect(response.body[0]).toHaveProperty('title');
    expect(response.body[0]).toHaveProperty('author');
    expect(response.body[0]).toHaveProperty('price');
    expect(response.body[0]).toHaveProperty('stock');
  });

  test('GET /api/books with no books returns empty array', async () => {
    const response = await request(app).get('/api/books');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test('GET /api/books/999 (nonexistent) returns 404', async () => {
    const response = await request(app).get('/api/books/999');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Book not found' });
  });

  test('Create 3 books, GET /api/books returns all 3', async () => {
    await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send({ title: 'Book A', author: 'Author 1', price: 10.00, stock: 2 });

    await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send({ title: 'Book B', author: 'Author 2', price: 20.00, stock: 4 });

    await request(app)
      .post('/api/books')
      .set('x-role', 'admin')
      .send({ title: 'Book C', author: 'Author 3', price: 30.00, stock: 6 });

    const response = await request(app).get('/api/books');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(3);
    expect(response.body[0].title).toBe('Book A');
    expect(response.body[1].title).toBe('Book B');
    expect(response.body[2].title).toBe('Book C');
  });
});
