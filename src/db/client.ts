import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type Database = ReturnType<typeof createDatabase>['db'];

export interface DatabaseOptions {
  url: string;
  max?: number;
  ssl?: boolean;
}

export function createDatabase({ url, max = 10, ssl }: DatabaseOptions) {
  const sql = postgres(url, {
    max,
    ssl: ssl ? 'require' : undefined,
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}

export { schema };
