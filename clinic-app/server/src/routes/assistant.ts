import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { runTool, sessionPatientId } from '../services/assistant';
import { clientInfo, recordAudit } from '../services/audit';
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
    void recordAudit({ actorType: 'anonymous', action: 'assistant_auth_failed', resource: 'assistant', outcome: 'denied', statusCode: 401, method: req.method, path: req.originalUrl.split('?')[0], ...clientInfo(req) });
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
  // The assistant reads and writes patient data on a caller's behalf, so every tool call is recorded.
  // Only the call id and tool name are stored, never what was said or returned.
  const callId = typeof req.body?.callId === 'string' ? req.body.callId : null;
  void recordAudit({
    actorType: 'assistant', actorId: callId, action: `assistant_${req.params.tool}`, resource: 'call', resourceId: callId,
    patientId: callId ? sessionPatientId(callId) : null,
    outcome: status === 200 && !body.error && body.verified !== false ? 'success' : 'failed',
    statusCode: status, method: 'POST', path: `/api/assistant/tools/${req.params.tool}`, ...clientInfo(req),
  });
  res.status(status).json(body);
});

export default router;
