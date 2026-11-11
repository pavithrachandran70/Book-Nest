const express = require('express');
const ordersRouter = require('./routes/orders');

const app = express();

app.use(express.json());
app.use('/api/orders', ordersRouter);

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

module.exports = app;
