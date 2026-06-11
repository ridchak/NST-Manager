import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { authMiddleware } from './middleware/auth';
import authRouter from './routes/auth';
import patientsRouter from './routes/patients';
import appointmentsRouter from './routes/appointments';
import progressRouter from './routes/progress';
import formsRouter from './routes/forms';
import insuranceRouter from './routes/insurance';
import phoneRouter from './routes/phone';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.get('/', (_req, res) => res.json({ status: 'ok', service: 'LifeStart Clinic API' }));

app.use('/api/auth', authRouter);
app.use('/api/patients', authMiddleware, patientsRouter);
app.use('/api/appointments', authMiddleware, appointmentsRouter);
app.use('/api/progress', authMiddleware, progressRouter);
app.use('/api/forms', authMiddleware, formsRouter);
app.use('/api/insurance', authMiddleware, insuranceRouter);
app.use('/api/phone', authMiddleware, phoneRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;
