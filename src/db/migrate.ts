import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

export async function runMigrations(url: string, ssl = false): Promise<void> {
  const sql = postgres(url, { max: 1, ssl: ssl ? 'require' : undefined, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required to run migrations');
    process.exit(1);
  }
  runMigrations(url, process.env.DATABASE_SSL === 'true')
    .then(() => {
      console.log('migrations applied');
      process.exit(0);
    })
    .catch((error: unknown) => {
      console.error('migration failed', error);
      process.exit(1);
    });
}
