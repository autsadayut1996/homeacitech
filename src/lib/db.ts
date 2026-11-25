import { PrismaClient } from "@prisma/client";
import { resolveDbEnv } from "../../scripts/db-env.mjs";

// Accept the variable names Vercel's Neon/Postgres integrations create.
resolveDbEnv();

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;
