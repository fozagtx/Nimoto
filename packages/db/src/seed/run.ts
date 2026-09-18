import { createDatabase } from '../client.js';
import { questions } from '../schema.js';
import { SEED_QUESTIONS } from './questions.js';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required to seed questions');
    process.exit(1);
  }

  const { db, close } = createDatabase({ url, max: 1 });
  try {
    const inserted = await db
      .insert(questions)
      .values(SEED_QUESTIONS)
      .onConflictDoNothing({ target: questions.prompt })
      .returning({ id: questions.id });
    console.log(`seeded ${inserted.length} new questions (${SEED_QUESTIONS.length} in bank)`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error('seed failed', error);
  process.exit(1);
});
