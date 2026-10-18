import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { Role, atLeast, canDo, isRole, requiredRole } from '../services/access';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Verifies the token, then loads the account from the database on every request so that
 * a role change or deactivation takes effect immediately instead of when the token expires.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  let decoded: { userId?: string };
  try {
    decoded = jwt.verify(authHeader.substring(7), secret) as { userId?: string };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) res.status(401).json({ error: 'Token expired' });
    else if (error instanceof jwt.JsonWebTokenError) res.status(401).json({ error: 'Invalid token' });
    else res.status(500).json({ error: 'Token verification failed' });
    return;
  }

  try {
    const user = decoded.userId ? await prisma.user.findUnique({ where: { id: decoded.userId } }) : null;
    if (!user || !user.active || !isRole(user.role)) {
      res.status(401).json({ error: 'Account is not active' });
      return;
    }
    req.user = { userId: user.id, email: user.email, role: user.role, name: user.name };
    next();
  } catch {
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/** Applies the permission policy in services/access.ts to the current request. Run after authMiddleware. */
export function authorize(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  // Mounted at "/api", so req.path is the path under /api.
  if (!canDo(user.role, req.method, req.path)) {
    res.status(403).json({
      error: 'You do not have permission to do that.',
      yourRole: user.role,
      requiredRole: requiredRole(req.method, req.path),
    });
    return;
  }
  next();
}

export function requireRole(minimum: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!atLeast(req.user.role, minimum)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
