import { Router, Request, Response } from 'express';
import { ringCentralService } from '../services/ringcentral';

const router = Router();

router.get('/config', (_req: Request, res: Response) => {
  const configured = !!(process.env.RC_CLIENT_ID && process.env.RC_CLIENT_SECRET && process.env.RC_USERNAME);
  res.json({ configured, serverUrl: process.env.RC_SERVER_URL || 'https://platform.ringcentral.com', note: configured ? 'Connected to Office@Hand' : 'Using demo data — set RC_CLIENT_ID, RC_CLIENT_SECRET, RC_USERNAME, RC_PASSWORD env vars' });
});

router.get('/calls', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '20');
    const calls = await ringCentralService.getCalls(limit);
    res.json(calls);
  } catch {
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

router.post('/call', async (req: Request, res: Response) => {
  try {
    const { toNumber, fromNumber } = req.body;
    if (!toNumber) return res.status(400).json({ error: 'toNumber is required' });
    const result = await ringCentralService.makeCall(toNumber, fromNumber);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

router.get('/messages', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '20');
    const messages = await ringCentralService.getMessages(limit);
    res.json(messages);
  } catch {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post('/message', async (req: Request, res: Response) => {
  try {
    const { toNumber, text } = req.body;
    if (!toNumber || !text) return res.status(400).json({ error: 'toNumber and text are required' });
    const result = await ringCentralService.sendMessage(toNumber, text);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

router.get('/voicemails', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || '10');
    const voicemails = await ringCentralService.getVoicemails(limit);
    res.json(voicemails);
  } catch {
    res.status(500).json({ error: 'Failed to fetch voicemails' });
  }
});

export default router;
