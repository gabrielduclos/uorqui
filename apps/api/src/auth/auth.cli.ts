import { betterAuth } from 'better-auth';
import { authPolicy } from './auth-policy.js';

// Used only by the Better Auth CLI to generate a Drizzle schema.
// Never start this as a service.
export const auth = betterAuth(authPolicy);
