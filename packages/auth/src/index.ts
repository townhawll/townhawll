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
  createExistingUserOnlyGoogleAuthAdapter,
  createGoogleAuthAdapter,
  getAdminGoogleSignInDecision,
  getGoogleSignInDecision,
  GOOGLE_PROVIDER_ID,
  markGoogleUserVerified,
  parseVerifiedGoogleProfile,
  type GoogleSignInDecision,
  type AdminGoogleSignInDecision,
} from "./google.ts";
export { hashPassword, verifyPassword } from "./password.ts";
export {
  ALL_PERMISSIONS,
  ALL_STAFF_ROLES,
  getEffectivePermissions,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isStaff,
  OwnerRequiredError,
  PERMISSION,
  PermissionRequiredError,
  requireAllPermissions,
  requireAnyPermission,
  requireOwner,
  requirePermission,
  requireStaff,
  ROLE_PERMISSIONS,
  StaffRequiredError,
  type Permission,
  type StaffAuthorization,
} from "./permissions.ts";
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
  emailPasswordLoginSchema,
  loginSchema,
  type EmailPasswordLoginInput,
  type LoginInput,
  type PasswordAuthenticationResult,
} from "./login.ts";
export {
  DEFAULT_AUTHENTICATED_DESTINATION,
  getLoginUrl,
  getSafeCallbackUrl,
} from "./redirects.ts";
export {
  getAuthSessionCookieName,
  getAuthSessionCookieOptions,
} from "./cookies.ts";
export {
  AUTH_SESSION_MAX_AGE_SECONDS,
  createAdminAuthConfig,
  createAuthConfig,
  createDatabaseSession,
  createSessionRecord,
  createTownHawllAuth,
  createTownHawllAdminAuth,
  endDatabaseSession,
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
export {
  canAssignRole,
  canManageStaff,
  canRemoveRole,
} from "./staff-management.ts";
export { getStaffRoles } from "./staff.ts";
export {
  getStaffAccessBySessionToken,
  resolveStaffAccess,
  type SessionIdentity,
  type StaffAccessState,
  type StaffContext,
} from "./staff-context.ts";
export type { StaffRole } from "@townhawll/db";
