const request = require('supertest');
const app = require('../src/app');
const { db } = require('../src/db');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'booknest.sqlite');

describe('Health check and database initialization', () => {
  afterAll(() => {
    db.close();
  });

  test('AC-1: Server startup creates database file with tables', () => {
    expect(fs.existsSync(dbPath)).toBe(true);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toEqual(['cart', 'cart_item', 'order', 'order_item', 'product']);

    const fkEnabled = db.pragma('foreign_keys', { simple: true });
    expect(fkEnabled).toBe(1);
  });

  test('AC-2: GET /api/health returns 200 { "status": "ok" }', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['content-type']).toMatch(/json/);
  });

  test('AC-14: Database persists across restart', () => {
    db.close();
    const reopenedDb = new Database(dbPath);
    const tables = reopenedDb.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toEqual(['cart', 'cart_item', 'order', 'order_item', 'product']);

    const fkEnabled = reopenedDb.pragma('foreign_keys', { simple: true });
    expect(fkEnabled).toBe(1);
    reopenedDb.close();
  });
});
