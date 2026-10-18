/**
 * Who may do what. This is the whole permission policy in one place.
 *
 *   user       view records and add new ones. Cannot edit existing records or delete.
 *   admin      everything a user can do, plus edit existing records
 *              (patients, progress, forms, insurance authorizations, appointments).
 *   superuser  full control: delete records, manage accounts, unlock locked accounts, read the audit log.
 *
 * The rule is by HTTP method, with a short list of exceptions for routine front-desk work.
 */

export type Role = 'user' | 'admin' | 'superuser';

export const ROLES: Role[] = ['user', 'admin', 'superuser'];

const LEVEL: Record<Role, number> = { user: 1, admin: 2, superuser: 3 };

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}

export function atLeast(role: string, needed: Role): boolean {
  return isRole(role) && LEVEL[role] >= LEVEL[needed];
}

interface Exception {
  method: string;
  /** Matched against the path under /api, e.g. "/appointments/abc". */
  pattern: RegExp;
  needs: Role;
  why: string;
}

const EXCEPTIONS: Exception[] = [
  { method: 'DELETE', pattern: /^\/appointments\/[^/]+$/, needs: 'user', why: 'cancelling an appointment is routine; the record is kept, only its status changes' },
  { method: 'PATCH', pattern: /^\/messages\/[^/]+$/, needs: 'user', why: 'staff mark assistant messages done' },
];

/** Minimum role needed for a request. Account management is handled separately (superuser only). */
export function requiredRole(method: string, apiPath: string): Role {
  const m = method.toUpperCase();
  const path = apiPath.split('?')[0].replace(/\/+$/, '') || '/';

  if (['/users', '/audit'].some(p => path === p || path.startsWith(p + '/'))) return 'superuser';

  const exception = EXCEPTIONS.find(e => e.method === m && e.pattern.test(path));
  if (exception) return exception.needs;

  switch (m) {
    case 'GET':
    case 'HEAD':
    case 'OPTIONS':
    case 'POST':
      return 'user';
    case 'PUT':
    case 'PATCH':
      return 'admin';
    case 'DELETE':
      return 'superuser';
    default:
      return 'superuser'; // unknown verbs fail closed
  }
}

export function canDo(role: string, method: string, apiPath: string): boolean {
  return atLeast(role, requiredRole(method, apiPath));
}
