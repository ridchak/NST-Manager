import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authMiddleware, authorize } from './middleware/auth';
import { auditRequests } from './middleware/audit';
import authRouter from './routes/auth';
import patientsRouter from './routes/patients';
import appointmentsRouter from './routes/appointments';
import progressRouter from './routes/progress';
import formsRouter from './routes/forms';
import insuranceRouter from './routes/insurance';
import phoneRouter from './routes/phone';
import assistantRouter from './routes/assistant';
import messagesRouter from './routes/messages';
import usersRouter from './routes/users';
import auditRouter from './routes/audit';
import practiceRouter from './routes/practice';

const app = express();

// Behind a hosting proxy, set TRUST_PROXY=1 so the audit log records the real client IP.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || true);

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Public: health check, sign-in, and the voice assistant (its own shared-key auth).
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'Premier Weight Management and Lifestyle API' }));
app.use('/api/auth', authRouter);
app.use('/api/assistant', assistantRouter);

// Everything below requires a signed-in, active account, and the permission policy in services/access.ts.
app.use('/api', authMiddleware, auditRequests, authorize);
app.use('/api/patients', patientsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/progress', progressRouter);
app.use('/api/forms', formsRouter);
app.use('/api/insurance', insuranceRouter);
app.use('/api/phone', phoneRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/users', usersRouter);
app.use('/api/audit', auditRouter);
app.use('/api/practice', practiceRouter);

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

export default app;
