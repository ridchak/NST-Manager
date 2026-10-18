import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authMiddleware } from './middleware/auth';
import authRouter from './routes/auth';
import patientsRouter from './routes/patients';
import appointmentsRouter from './routes/appointments';
import progressRouter from './routes/progress';
import formsRouter from './routes/forms';
import insuranceRouter from './routes/insurance';
import phoneRouter from './routes/phone';
import assistantRouter from './routes/assistant';
import messagesRouter from './routes/messages';


const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'LifeStart Clinic API' }));

app.use('/api/auth', authRouter);
app.use('/api/patients', authMiddleware, patientsRouter);
app.use('/api/appointments', authMiddleware, appointmentsRouter);
app.use('/api/progress', authMiddleware, progressRouter);
app.use('/api/forms', authMiddleware, formsRouter);
app.use('/api/insurance', authMiddleware, insuranceRouter);
app.use('/api/phone', authMiddleware, phoneRouter);
app.use('/api/messages', authMiddleware, messagesRouter);
app.use('/api/assistant', assistantRouter);

// In production the built web app is served by this same server (one service to host).
const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;
