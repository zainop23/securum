import express from 'express';
import cors from 'cors';
import { config } from './config';
import { pool } from './db';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => {
  const maskedUrl = config.databaseUrl.replace(/\/\/.*@/, '//***@');
  console.log(`Coordinator running on port ${config.port}`);
  console.log(`Database: ${maskedUrl}`);
});
