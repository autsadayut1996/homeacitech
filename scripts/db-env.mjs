/**
 * Fill DATABASE_URL / DIRECT_URL from whatever variables Vercel's Neon / Postgres integrations
 * created, so the app works without setting DIRECT_URL by hand — including custom prefixes
 * (e.g. STORAGE_URL / STORAGE_URL_UNPOOLED when the prefix "STORAGE" was chosen).
 *   DATABASE_URL ← DATABASE_URL | POSTGRES_PRISMA_URL | POSTGRES_URL | any other *_URL holding a postgres:// URL
 *   DIRECT_URL   ← DIRECT_URL | DATABASE_URL_UNPOOLED | POSTGRES_URL_NON_POOLING | any *_UNPOOLED / *_NON_POOLING postgres URL | DATABASE_URL
 */
const isPg = (v) => typeof v === "string" && /^postgres(ql)?:\/\//.test(v.trim());

export function resolveDbEnv(env = process.env) {
  const pick = (...names) => names.map((n) => env[n]).find(isPg);
  const scan = (test) =>
    Object.keys(env)
      .sort()
      .filter((k) => test(k) && isPg(env[k]))
      .map((k) => env[k])[0];
  const unpooled = (k) => /_(UNPOOLED|NON_POOLING)$/.test(k);
  const database =
    pick("DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL") ?? scan((k) => /_URL$/.test(k) && !unpooled(k)) ?? scan(unpooled);
  const direct = pick("DIRECT_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING") ?? scan(unpooled) ?? database;
  if (database) env.DATABASE_URL = database;
  if (direct) env.DIRECT_URL = direct;
  return { database, direct };
}
