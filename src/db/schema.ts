import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const challengeStatusEnum = pgEnum('challenge_status', ['draft', 'active', 'closed', 'settled']);
export const attemptModeEnum = pgEnum('attempt_mode', ['ranked', 'practice']);
export const attemptStatusEnum = pgEnum('attempt_status', ['started', 'completed', 'expired']);
export const optionEnum = pgEnum('question_option', ['a', 'b', 'c', 'd']);
export const payoutStatusEnum = pgEnum('payout_status', [
  'pending',
  'processing',
  'broadcast',
  'confirmed',
  'failed',
]);
export const sponsorStatusEnum = pgEnum('sponsor_status', ['pending', 'confirmed', 'failed']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletAddress: text('wallet_address').notNull(),
    displayName: text('display_name'),
    referralCode: text('referral_code').notNull(),
    referredByUserId: uuid('referred_by_user_id'),
    xp: integer('xp').notNull().default(0),
    isAdmin: boolean('is_admin').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    walletAddressUnique: uniqueIndex('users_wallet_address_unique').on(table.walletAddress),
    referralCodeUnique: uniqueIndex('users_referral_code_unique').on(table.referralCode),
    referredByIdx: index('users_referred_by_idx').on(table.referredByUserId),
    noSelfReferral: check('users_no_self_referral', sql`${table.referredByUserId} IS DISTINCT FROM ${table.id}`),
  }),
);

export const authChallenges = pgTable(
  'auth_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletAddress: text('wallet_address').notNull(),
    nonce: text('nonce').notNull(),
    message: text('message').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nonceUnique: uniqueIndex('auth_challenges_nonce_unique').on(table.nonce),
    addressIdx: index('auth_challenges_address_idx').on(table.walletAddress),
    expiresIdx: index('auth_challenges_expires_idx').on(table.expiresAt),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Only the SHA-256 hash of the bearer token is ever stored.
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    userIdx: index('sessions_user_idx').on(table.userId),
  }),
);

export const dailyChallenges = pgTable(
  'daily_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    challengeDate: date('challenge_date').notNull(),
    status: challengeStatusEnum('status').notNull().default('draft'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    prizeConfig: jsonb('prize_config').notNull(),
    bonusPoolLuna: text('bonus_pool_luna').notNull().default('0'),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dateUnique: uniqueIndex('daily_challenges_date_unique').on(table.challengeDate),
    statusIdx: index('daily_challenges_status_idx').on(table.status),
  }),
);

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prompt: text('prompt').notNull(),
    optionA: text('option_a').notNull(),
    optionB: text('option_b').notNull(),
    optionC: text('option_c').notNull(),
    optionD: text('option_d').notNull(),
    correctOption: optionEnum('correct_option').notNull(),
    explanation: text('explanation'),
    category: text('category').notNull(),
    difficulty: smallint('difficulty').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    promptUnique: uniqueIndex('questions_prompt_unique').on(table.prompt),
    categoryIdx: index('questions_category_idx').on(table.category),
    difficultyRange: check('questions_difficulty_range', sql`${table.difficulty} BETWEEN 1 AND 5`),
  }),
);

export const dailyChallengeQuestions = pgTable(
  'daily_challenge_questions',
  {
    dailyChallengeId: uuid('daily_challenge_id')
      .notNull()
      .references(() => dailyChallenges.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    position: smallint('position').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.dailyChallengeId, table.position] }),
    questionUnique: uniqueIndex('daily_challenge_questions_question_unique').on(
      table.dailyChallengeId,
      table.questionId,
    ),
    positionRange: check('daily_challenge_questions_position_range', sql`${table.position} >= 1`),
  }),
);

export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dailyChallengeId: uuid('daily_challenge_id')
      .notNull()
      .references(() => dailyChallenges.id, { onDelete: 'cascade' }),
    mode: attemptModeEnum('mode').notNull(),
    status: attemptStatusEnum('status').notNull().default('started'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    // Server clock reference used to time the question currently in flight.
    questionServedAt: timestamp('question_served_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    totalScore: integer('total_score'),
    correctCount: smallint('correct_count'),
    totalDurationMs: integer('total_duration_ms'),
    flagged: boolean('flagged').notNull().default(false),
  },
  (table) => ({
    // One ranked attempt per wallet per challenge, enforced by the database.
    oneRankedPerUserPerChallenge: uniqueIndex('attempts_one_ranked_per_user_per_challenge')
      .on(table.userId, table.dailyChallengeId)
      .where(sql`${table.mode} = 'ranked'`),
    leaderboardIdx: index('attempts_leaderboard_idx').on(
      table.dailyChallengeId,
      table.totalScore,
      table.totalDurationMs,
      table.completedAt,
    ),
    userIdx: index('attempts_user_idx').on(table.userId),
  }),
);

export const attemptAnswers = pgTable(
  'attempt_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    position: smallint('position').notNull(),
    selectedOption: optionEnum('selected_option').notNull(),
    isCorrect: boolean('is_correct').notNull(),
    elapsedMs: integer('elapsed_ms').notNull(),
    scoreAwarded: integer('score_awarded').notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    oneAnswerPerQuestion: uniqueIndex('attempt_answers_attempt_question_unique').on(
      table.attemptId,
      table.questionId,
    ),
    oneAnswerPerPosition: uniqueIndex('attempt_answers_attempt_position_unique').on(
      table.attemptId,
      table.position,
    ),
  }),
);

export const streaks = pgTable('streaks', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastCompletedDate: date('last_completed_date'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const referrals = pgTable(
  'referrals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    referrerUserId: uuid('referrer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    referredUserId: uuid('referred_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    qualifiedAt: timestamp('qualified_at', { withTimezone: true }),
  },
  (table) => ({
    // A referred wallet belongs to exactly one referrer, forever.
    referredUnique: uniqueIndex('referrals_referred_user_unique').on(table.referredUserId),
    referrerIdx: index('referrals_referrer_idx').on(table.referrerUserId),
    noSelfReferral: check('referrals_no_self_referral', sql`${table.referrerUserId} <> ${table.referredUserId}`),
  }),
);

export const prizePayouts = pgTable(
  'prize_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    challengeId: uuid('challenge_id')
      .notNull()
      .references(() => dailyChallenges.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id, { onDelete: 'restrict' }),
    recipientAddress: text('recipient_address').notNull(),
    rank: integer('rank').notNull(),
    amountLuna: text('amount_luna').notNull(),
    status: payoutStatusEnum('status').notNull().default('pending'),
    transactionHash: text('transaction_hash'),
    error: text('error'),
    attemptCount: integer('attempt_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Idempotency: one payout row per challenge+rank and per challenge+user.
    challengeRankUnique: uniqueIndex('prize_payouts_challenge_rank_unique').on(table.challengeId, table.rank),
    challengeUserUnique: uniqueIndex('prize_payouts_challenge_user_unique').on(table.challengeId, table.userId),
    statusIdx: index('prize_payouts_status_idx').on(table.status),
    positiveAmount: check('prize_payouts_positive_amount', sql`${table.amountLuna} ~ '^[0-9]+$'`),
  }),
);

export const sponsorContributions = pgTable(
  'sponsor_contributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    challengeDate: date('challenge_date').notNull(),
    amountLuna: text('amount_luna').notNull(),
    status: sponsorStatusEnum('status').notNull().default('pending'),
    transactionHash: text('transaction_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (table) => ({
    txUnique: uniqueIndex('sponsor_contributions_tx_unique').on(table.transactionHash),
    dateIdx: index('sponsor_contributions_date_idx').on(table.challengeDate),
  }),
);

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    event: text('event').notNull(),
    properties: jsonb('properties'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventIdx: index('analytics_events_event_idx').on(table.event, table.createdAt),
  }),
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    subject: text('subject'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    actionIdx: index('audit_logs_action_idx').on(table.action, table.createdAt),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type DailyChallenge = typeof dailyChallenges.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type AttemptAnswer = typeof attemptAnswers.$inferSelect;
export type Streak = typeof streaks.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type PrizePayout = typeof prizePayouts.$inferSelect;
export type SponsorContribution = typeof sponsorContributions.$inferSelect;
