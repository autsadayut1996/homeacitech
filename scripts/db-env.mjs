/**
 * Fill DATABASE_URL / DIRECT_URL from the variable names Vercel's Neon / Postgres integrations
 * create, so the app works without setting DIRECT_URL by hand.
 *   DATABASE_URL  ← DATABASE_URL | POSTGRES_PRISMA_URL | POSTGRES_URL
 *   DIRECT_URL    ← DIRECT_URL | DATABASE_URL_UNPOOLED | POSTGRES_URL_NON_POOLING | DATABASE_URL
 */
export function resolveDbEnv(env = process.env) {
  const pick = (...names) => names.map((n) => env[n]).find((v) => v && v.trim());
  const database = pick("DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL");
  const direct = pick("DIRECT_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING") ?? database;
  if (database) env.DATABASE_URL = database;
  if (direct) env.DIRECT_URL = direct;
  return { database, direct };
}
