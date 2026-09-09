export {
  findUserByEmail,
  findUserByIdentifier,
  findUserByUsername,
  normalizeEmail,
  normalizeUsername,
} from "./account.ts";
export {
  AccountUnavailableError,
  AuthenticationRequiredError,
  EmailVerificationRequiredError,
  requireUser,
  requireVerifiedUser,
} from "./guards.ts";
export {
  allowGoogleOAuthStart,
  createGoogleAuthAdapter,
  getGoogleSignInDecision,
  GOOGLE_PROVIDER_ID,
  markGoogleUserVerified,
  parseVerifiedGoogleProfile,
  type GoogleSignInDecision,
} from "./google.ts";
export { hashPassword, verifyPassword } from "./password.ts";
export {
  allowPasswordResetAttempt,
  allowPasswordResetRequest,
  createPasswordResetRequest,
  forgotPasswordSchema,
  getPasswordResetTokenStatus,
  resetPassword,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type PasswordResetResult,
  type PasswordResetTokenStatus,
  type ResetPasswordInput,
} from "./password-reset.ts";
export {
  allowLogin,
  authenticatePasswordUser,
  loginSchema,
  type LoginInput,
  type PasswordAuthenticationResult,
} from "./login.ts";
export {
  DEFAULT_AUTHENTICATED_DESTINATION,
  getLoginUrl,
  getSafeCallbackUrl,
} from "./redirects.ts";
export {
  AUTH_SESSION_MAX_AGE_SECONDS,
  createAuthConfig,
  createDatabaseSession,
  createSessionRecord,
  createTownHawllAuth,
  endDatabaseSession,
  getAuthSessionCookieName,
  getAuthSessionCookieOptions,
} from "./session.ts";
export {
  allowSignup,
  allowVerificationResend,
  registerPasswordUser,
  replaceVerificationToken,
  signupSchema,
  verificationResendSchema,
  verifyEmailToken,
  type EmailVerificationResult,
  type RegistrationResult,
  type SignupInput,
} from "./signup.ts";
export {
  createAuthToken,
  hashAuthToken,
  type AuthTokenPair,
} from "./tokens.ts";
