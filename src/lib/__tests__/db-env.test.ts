import { describe, expect, it } from "vitest";
import { resolveDbEnv } from "../../../scripts/db-env.mjs";

const P = "postgresql://u:p@pooled.neon.tech/db";
const D = "postgresql://u:p@direct.neon.tech/db";

describe("resolveDbEnv", () => {
  it("uses the standard Neon names", () => {
    const env: Record<string, string> = { DATABASE_URL: P, DATABASE_URL_UNPOOLED: D };
    resolveDbEnv(env as unknown as NodeJS.ProcessEnv);
    expect([env.DATABASE_URL, env.DIRECT_URL]).toEqual([P, D]);
  });
  it("finds a custom prefix (STORAGE_URL / STORAGE_URL_UNPOOLED)", () => {
    const env: Record<string, string> = { STORAGE_URL: P, STORAGE_URL_UNPOOLED: D, STORAGE_PGHOST: "x", NEXT_PUBLIC_SITE_URL: "https://site" };
    resolveDbEnv(env as unknown as NodeJS.ProcessEnv);
    expect([env.DATABASE_URL, env.DIRECT_URL]).toEqual([P, D]);
  });
  it("falls back to the same URL for migrations", () => {
    const env: Record<string, string> = { POSTGRES_URL: P };
    resolveDbEnv(env as unknown as NodeJS.ProcessEnv);
    expect(env.DIRECT_URL).toBe(P);
  });
  it("reports nothing when no postgres URL exists", () => {
    const env: Record<string, string> = { NEXT_PUBLIC_SITE_URL: "https://site" };
    expect(resolveDbEnv(env as unknown as NodeJS.ProcessEnv).database).toBeUndefined();
  });
});
