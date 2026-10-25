import { Application } from './core/Application.js';
import { buildHealthReport, getHealthHttpStatus } from './utils/Health.js';
import http from 'http';

const app = new Application();

// Health check server for Render
const PORT = process.env.PORT || 10000;
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    const report = buildHealthReport(app.healthDependencies);
    res.writeHead(getHealthHttpStatus(report), { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(report));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

healthServer.listen(PORT, () => {
  console.log(`Health check server running on port ${PORT}`);
});

app.start();

export { buildHealthReport };
