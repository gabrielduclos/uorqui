import type { FastifyRequest } from 'fastify';

/** Fail-closed, exact-match write origin guard shared by protected API routes.
 * This deliberately does not loosen CORS or accept sibling/custom hosts.
 * An unset WEB_ORIGIN retains the existing local development default.
 */
export function validRequestOrigin(request: Pick<FastifyRequest, 'headers'>): boolean {
  return request.headers.origin === (process.env.WEB_ORIGIN ?? 'http://localhost:5173');
}
