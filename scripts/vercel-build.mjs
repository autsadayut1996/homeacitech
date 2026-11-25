// Build on Vercel: resolve database variables, apply migrations, build Next.js.
import { execSync } from "node:child_process";
import { resolveDbEnv } from "./db-env.mjs";

const { database, direct } = resolveDbEnv();
if (!database) {
  console.error(
    "\n✖ No database configured.\n" +
      "  Add a Postgres database: Vercel project → Storage → Neon → Connect, then redeploy.\n" +
      "  (Or set DATABASE_URL yourself in Settings → Environment Variables.)\n" +
      "  ยังไม่ได้ตั้งค่าฐานข้อมูล: ไปที่ Storage → สร้าง/เชื่อม Neon แล้ว Redeploy\n",
  );
  process.exit(1);
}
const host = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return "(unparsable URL)";
  }
};
console.log(`Database: ${host(database)}  ·  migrations via: ${host(direct)}`);
const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });
run("npx prisma generate");
run("npx prisma migrate deploy");
run("npx next build");
