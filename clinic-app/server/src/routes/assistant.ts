import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { runTool } from '../services/assistant';
import { TOOL_DEFINITIONS, buildSystemPrompt } from '../services/assistantPrompt';

const router = Router();

/**
 * The voice platform authenticates with a shared secret (header x-assistant-key),
 * not a staff login. Fails closed when no key is configured.
 */
function assistantKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ASSISTANT_API_KEY;
  if (!expected) {
    res.status(503).json({ error: 'Assistant is not configured (ASSISTANT_API_KEY missing)' });
    return;
  }
  const given = String(req.headers['x-assistant-key'] ?? '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Invalid assistant key' });
    return;
  }
  next();
}

router.use(assistantKey);

router.get('/prompt', (_req, res) => res.json({ prompt: buildSystemPrompt() }));
router.get('/tools', (_req, res) => res.json({ tools: TOOL_DEFINITIONS }));

router.post('/tools/:tool', async (req: Request, res: Response) => {
  const { status, body } = await runTool(req.params.tool, req.body);
  res.status(status).json(body);
});

export default router;
