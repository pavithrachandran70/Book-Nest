const app = require('./app');
const { initDb } = require('./db');

const port = Number(process.env.PORT) || 3000;

initDb();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
