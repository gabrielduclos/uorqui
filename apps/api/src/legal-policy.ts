/**
 * Versioned legal agreements. Only essential session/security cookies are
 * currently used; do not imply a click on "Got it" is optional cookie consent.
 */
export const TERMS_VERSION='2026-11-01';
export const PRIVACY_NOTICE_VERSION='2026-11-01';
export function validSignupAgreement(value:Record<string,unknown>){
  return value.termsAccepted===true && value.privacyNoticeAcknowledged===true &&
    value.termsVersion===TERMS_VERSION && value.privacyVersion===PRIVACY_NOTICE_VERSION;
}
