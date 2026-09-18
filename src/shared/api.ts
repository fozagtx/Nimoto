import { z } from 'zod';
import { OPTIONS, type AttemptMode, type ChallengeStatus } from './challenge.js';
import { CHALLENGE_DATE_PATTERN } from './dates.js';
import { REFERRAL_ALPHABET, REFERRAL_CODE_LENGTH } from './referrals.js';

/* ----------------------------- request schemas ---------------------------- */

export const addressSchema = z
  .string()
  .min(36)
  .max(44)
  .transform((value) => value.replace(/\s+/g, '').toUpperCase());

export const hexSchema = z.string().regex(/^[0-9a-fA-F]+$/, 'expected hex');

export const authChallengeRequestSchema = z.object({
  address: addressSchema,
});

export const authVerifyRequestSchema = z.object({
  address: addressSchema,
  message: z.string().min(1).max(2000),
  publicKey: hexSchema.length(64),
  signature: hexSchema.length(128),
  referralCode: z
    .string()
    .regex(new RegExp(`^[${REFERRAL_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`, 'i'))
    .optional(),
});

export const startAttemptRequestSchema = z.object({
  mode: z.enum(['ranked', 'practice']),
});

export const answerRequestSchema = z.object({
  questionId: z.string().uuid(),
  selectedOption: z.enum(OPTIONS),
});

export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'Display names may only contain letters, numbers, spaces, _ . -');

export const updateProfileRequestSchema = z.object({
  displayName: displayNameSchema.nullable(),
});

export const analyticsEventSchema = z.object({
  event: z.enum([
    'app_opened',
    'wallet_auth_started',
    'wallet_auth_completed',
    'ranked_attempt_started',
    'question_answered',
    'ranked_attempt_completed',
    'leaderboard_viewed',
    'share_clicked',
    'referral_link_opened',
    'referral_qualified',
    'sponsor_payment_started',
    'sponsor_payment_completed',
  ]),
  properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const sponsorIntentRequestSchema = z.object({
  amountNim: z
    .string()
    .regex(/^\d+(\.\d{1,5})?$/, 'amountNim must be a positive decimal with at most 5 decimals'),
  challengeDate: z.string().regex(CHALLENGE_DATE_PATTERN).optional(),
});

export const sponsorConfirmRequestSchema = z.object({
  contributionId: z.string().uuid(),
  transactionHash: hexSchema.length(64),
});

export type AuthChallengeRequest = z.infer<typeof authChallengeRequestSchema>;
export type AuthVerifyRequest = z.infer<typeof authVerifyRequestSchema>;
export type AnswerRequest = z.infer<typeof answerRequestSchema>;
export type AnalyticsEventRequest = z.infer<typeof analyticsEventSchema>;
export type SponsorIntentRequest = z.infer<typeof sponsorIntentRequestSchema>;

/* ----------------------------- response shapes ---------------------------- */

export interface AuthChallengeResponse {
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface SessionUser {
  id: string;
  walletAddress: string;
  displayName: string | null;
  referralCode: string;
  xp: number;
  currentStreak: number;
  longestStreak: number;
}

export interface AuthVerifyResponse {
  token: string;
  expiresAt: string;
  user: SessionUser;
}

export interface PrizeTierView {
  fromRank: number;
  toRank: number;
  amountNim: string;
}

export interface TodayChallengeResponse {
  challengeDate: string;
  status: ChallengeStatus;
  phase: 'active' | 'pending_settlement' | 'settled' | 'pending';
  startsAt: string;
  endsAt: string;
  serverTime: string;
  msRemaining: number;
  questionCount: number;
  prizePoolNim: string;
  prizeTiers: PrizeTierView[];
  playersToday: number;
  scoringRules: string[];
  me: {
    rankedAttempt: {
      attemptId: string;
      status: 'started' | 'completed' | 'expired';
      answeredCount: number;
      totalScore: number | null;
      rank: number | null;
    } | null;
    currentStreak: number;
  } | null;
}

export interface QuestionView {
  questionId: string;
  position: number;
  prompt: string;
  options: { key: 'a' | 'b' | 'c' | 'd'; text: string }[];
  category: string;
  difficulty: number;
  serverTime: string;
}

export interface AttemptStateResponse {
  attemptId: string;
  mode: AttemptMode;
  status: 'started' | 'completed' | 'expired';
  challengeDate: string;
  questionCount: number;
  answeredCount: number;
  expiresAt: string;
  currentQuestion: QuestionView | null;
  result: AttemptResultResponse | null;
}

export interface AnswerResponse {
  isCorrect: boolean;
  correctOption: 'a' | 'b' | 'c' | 'd';
  pointsEarned: number;
  timeBonus: number;
  elapsedMs: number;
  explanation: string | null;
  nextQuestion: QuestionView | null;
  result: AttemptResultResponse | null;
}

export interface AttemptResultResponse {
  attemptId: string;
  mode: AttemptMode;
  totalScore: number;
  correctCount: number;
  questionCount: number;
  totalDurationMs: number;
  rank: number | null;
  playersToday: number;
  currentStreak: number;
  prizeNim: string | null;
  nextChallengePoolNim: string;
  /** Absolute invite link for this player, carrying their referral code. */
  referralUrl: string;
  shareText: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string | null;
  walletAddressAbbreviated: string;
  totalScore: number;
  totalDurationMs: number;
  completedAt: string;
  prizeNim: string | null;
  isMe: boolean;
}

export interface LeaderboardResponse {
  challengeDate: string;
  status: ChallengeStatus;
  phase: 'active' | 'pending_settlement' | 'settled' | 'pending';
  msRemaining: number;
  serverTime: string;
  prizePoolNim: string;
  prizeTiers: PrizeTierView[];
  playersToday: number;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

export interface ReferralSummaryResponse {
  code: string;
  link: string;
  qualifiedCount: number;
  pendingCount: number;
  xp: number;
}

export interface MeResponse {
  user: SessionUser;
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate: string | null;
  totalRankedAttempts: number;
  bestRank: number | null;
}

export interface SponsorIntentResponse {
  contributionId: string;
  recipient: string;
  amountLuna: string;
  amountNim: string;
  challengeDate: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
