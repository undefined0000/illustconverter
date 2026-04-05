require('./load-env');
const { app, ready } = require('./app');

const PORT = process.env.PORT || 3000;

async function startServer() {
  await ready;

  app.listen(PORT, () => {
    console.log(`IllustConverter server running on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = app;
