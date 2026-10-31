/** The public product cannot accept signups until verification and abuse controls exist. */
export function isDevelopmentSignupEnabled(): boolean {
  return (
    (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
    process.env.ENABLE_DEV_SIGNUP === 'true'
  );
}
