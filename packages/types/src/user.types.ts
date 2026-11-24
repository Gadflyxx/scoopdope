/**
 * Shared user-related types used by both frontend and backend.
 * @module user.types
 */

/** Roles available in the platform */
export type UserRole = 'student' | 'instructor' | 'admin';

/**
 * Public-facing user profile data.
 * Safe to expose to the frontend — excludes sensitive fields like passwordHash.
 */
export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  avatar: string | null;
  bio: string | null;
  role: UserRole;
  stellarPublicKey: string | null;
  /** Base64-encoded E2E public key for direct messages (null until generated) */
  publicKey: string | null;
  /** Monotonically increasing version of the user's public key */
  publicKeyVersion: number;
  isVerified: boolean;
  mfaEnabled: boolean;
  referralCode: string | null;
  /** Number of users who signed up with this user's referral code */
  referralCount: number;
  /** Total BST tokens earned from referrals */
  referralEarnings: number;
  createdAt: string;
  themePreference: 'light' | 'dark' | 'system';
  /** Whether the user has completed the guided onboarding flow */
  onboardingCompleted: boolean;
}

/**
 * Referral statistics for a user's profile.
 */
export interface ReferralStats {
  /** The user's unique referral code */
  code: string;
  /** Number of users who signed up with this code */
  count: number;
  /** Total BST tokens earned from referrals */
  earnings: number;
}

/**
 * DTO for validating a referral code.
 */
export interface ReferralDto {
  /** Referral code to validate */
  code: string;
}

/**
 * DTO for updating a user's profile.
 * All fields are optional — only provided fields are updated.
 */
export interface UpdateUserDto {
  /** 3–30 characters */
  username?: string;
  /** Must be a valid URL */
  avatar?: string;
  /** Max 500 characters, HTML stripped */
  bio?: string;
  /** Theme preference */
  theme?: 'light' | 'dark' | 'system';
}

/**
 * DTO for user registration.
 */
export interface RegisterDto {
  email: string;
  /** Min 8 characters */
  password: string;
  /** Optional referral code from an existing user */
  referralCode?: string;
}

/**
 * DTO for user login.
 */
export interface LoginDto {
  email: string;
  password: string;
  /** TOTP code or backup code — required if MFA is enabled */
  mfaToken?: string;
}

/**
 * Response returned after a successful login or token refresh.
 */
export interface AuthTokensResponse {
  access_token: string;
  refresh_token: string;
}

/**
 * Response when MFA is required to complete login.
 */
export interface MfaRequiredResponse {
  mfa_required: true;
}

/** Union of possible login responses */
export type LoginResponse = AuthTokensResponse | MfaRequiredResponse;

/**
 * Response returned by GET /v1/users/me/streak.
 * Describes the learner's daily learning streak.
 */
export interface StreakDto {
  /** Number of consecutive days with learning activity */
  current_streak: number;
  /** Highest streak ever achieved by the learner */
  longest_streak: number;
  /** ISO date (YYYY-MM-DD) of the last learning activity, or null if none */
  last_activity_date: string | null;
}

/**
 * JWT payload decoded from an access token.
 */
export interface JwtPayload {
  /** User ID */
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * DTO for registering or rotating a user's E2E public key.
 * The private key never leaves the client.
 */
export interface UpdatePublicKeyDto {
  /** Base64-encoded public key */
  publicKey: string;
}

/**
 * Public key data returned when looking up a recipient's key.
 */
export interface PublicKeyDto {
  userId: string;
  /** Base64-encoded public key */
  publicKey: string;
  /** Version of the key — used to detect rotation */
  publicKeyVersion: number;
}

/**
 * A stored direct message.
 * Only ciphertext is stored — the backend cannot decrypt message content.
 */
export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  /** Base64-encoded ciphertext encrypted with the recipient's public key */
  ciphertext: string;
  /** Version of the recipient's public key used for encryption */
  recipientKeyVersion: number;
  createdAt: string;
}
