import { Hono } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { dailyChallenges, sponsorContributions } from '@nimoto/db';
import {
  lunaToNim,
  nimToLuna,
  sponsorConfirmRequestSchema,
  sponsorIntentRequestSchema,
  toChallengeDate,
  type ChallengeDate,
  type SponsorIntentResponse,
} from '@nimoto/shared';
import type { AppBindings } from '../context.js';
import { ApiError } from '../lib/errors.js';
import { requireUser } from '../middleware.js';

/**
 * Sponsorship is pull-only: the API records an intent, the sponsor signs the
 * transfer in their own wallet, and the confirmed hash is recorded afterwards.
 * The treasury never signs anything here.
 */
export function sponsorRoutes() {
  const app = new Hono<AppBindings>();

  app.post('/sponsor/intents', requireUser, async (c) => {
    const ctx = c.get('ctx');
    const user = c.get('user')!;
    if (!ctx.treasury.address) {
      throw ApiError.badRequest('treasury_disabled', 'Sponsorship is unavailable right now');
    }
    const body = sponsorIntentRequestSchema.parse(await c.req.json());
    const amountLuna = nimToLuna(body.amountNim);
    if (amountLuna <= 0n) throw ApiError.badRequest('invalid_amount', 'Enter an amount greater than zero');

    const challengeDate = (body.challengeDate ?? toChallengeDate(new Date())) as ChallengeDate;
    const [contribution] = await ctx.db
      .insert(sponsorContributions)
      .values({ userId: user.id, challengeDate, amountLuna: amountLuna.toString() })
      .returning();
    if (!contribution) throw ApiError.internal('sponsor_intent_failed', 'Could not record the contribution');

    return c.json<SponsorIntentResponse>({
      contributionId: contribution.id,
      recipient: ctx.treasury.address,
      amountLuna: amountLuna.toString(),
      amountNim: lunaToNim(amountLuna),
      challengeDate,
    });
  });

  app.post('/sponsor/confirm', requireUser, async (c) => {
    const ctx = c.get('ctx');
    const user = c.get('user')!;
    const body = sponsorConfirmRequestSchema.parse(await c.req.json());

    const updated = await ctx.db
      .update(sponsorContributions)
      .set({ status: 'confirmed', transactionHash: body.transactionHash, confirmedAt: new Date() })
      .where(
        and(
          eq(sponsorContributions.id, body.contributionId),
          eq(sponsorContributions.userId, user.id),
          eq(sponsorContributions.status, 'pending'),
        ),
      )
      .returning();

    const contribution = updated[0];
    if (!contribution) throw ApiError.notFound('contribution_not_found', 'No pending contribution to confirm');

    // Confirmed sponsorship grows the advertised bonus pool for that day.
    await ctx.db
      .update(dailyChallenges)
      .set({
        bonusPoolLuna: sponsorBonusExpression(contribution.amountLuna),
      })
      .where(eq(dailyChallenges.challengeDate, contribution.challengeDate));

    return c.json({ ok: true, amountNim: lunaToNim(BigInt(contribution.amountLuna)) });
  });

  return app;
}

function sponsorBonusExpression(amountLuna: string) {
  return sql`(${dailyChallenges.bonusPoolLuna}::numeric + ${amountLuna}::numeric)::text`;
}
