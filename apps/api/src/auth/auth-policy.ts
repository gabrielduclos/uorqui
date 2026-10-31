/**
 * Share schema-affecting options between the Better Auth CLI and the runtime.
 * No database credentials are needed to generate the auth schema.
 */
export const authPolicy = {
  appName: 'Uorqui',
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  advanced: {
    database: {
      generateId: 'uuid' as const,
    },
  },
};
