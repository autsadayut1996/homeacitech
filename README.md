# House Design for Sales — ระบบออกแบบบ้านสำหรับเซลล์

Web app ให้เซลล์บริษัทรับสร้างบ้านรับโจทย์ลูกค้า → สร้างแปลนด้วย AI → ปรับแก้ 2D/3D → ประเมินราคา BOQ → ตรวจกฎหมายเบื้องต้น → ออกใบเสนอราคา

> ⚠️ แบบและราคาในระบบเป็น **แบบร่างเพื่อการขาย** ไม่ใช่แบบก่อสร้าง ต้องให้สถาปนิก/วิศวกรผู้มีใบอนุญาตตรวจรับรองก่อนใช้งานจริง

## Stack
Next.js 15 (App Router) · TypeScript · PostgreSQL + Prisma · next-intl (TH/EN, cookie-based) · Tailwind v4 · Vitest

## Structure
```
src/lib/plan-core/   Pure TS — plan JSON schema (single source of truth), geometry,
                     wall derivation, metrics (area/FAR/OSR), validator, TH/EN messages
src/lib/brief.ts     Design-brief schema (zod) + land → site conversion
src/app/             Pages + server actions
src/components/      BriefForm, SitePlanSvg (site + floor plan renderer), PlanSummary
prisma/              Schema (full MVP data model) + seed
```

### Plan JSON conventions
- Metres, y-up frame; edge 0 of the plot is the front.
- Rooms are rectilinear polygons on **wall centrelines**; walls are derived, not stored.
- Doors/windows are anchored to a room edge (`roomId`, `edgeIndex`, `offsetM`) so they move with the room.
- Stairs are rooms of type `stair`; the same `stairLinkId` on consecutive levels = one stair.

## Run locally
```bash
cp .env.example .env          # set DATABASE_URL / DIRECT_URL
npm install
npx prisma migrate dev        # create tables
npm run db:seed               # sample customers, projects, a sample 2-storey plan, Bangkok rules
npm run dev                   # http://localhost:3000
npm test                      # unit tests (plan-core)
```

## Deploy to Vercel
1. Create a Postgres database (Vercel Marketplace → **Neon** is simplest).
2. In the Vercel project set env vars:
   - `DATABASE_URL` — pooled connection string
   - `DIRECT_URL` — direct (non-pooled) connection string, used for migrations
   - `APP_PASSWORD` — **recommended**: the app has no user accounts, so without this anyone with the URL can use it (and your Claude API credits later)
   - `ANTHROPIC_API_KEY` — from milestone 3
3. Set the build command to `npm run vercel-build` (runs `prisma migrate deploy` then `next build`).
4. Seed once from your machine: `DATABASE_URL=<direct url> npm run db:seed`.

## AI floor plans (M3)
- Model: `claude-opus-5-5` (adaptive thinking, effort `high`), structured JSON output, server-side refusal fallback (`fallbacks: "default"`).
- The AI returns room rectangles + which rooms connect + which sides get windows (`src/lib/ai/format.ts`);
  code places doors/windows on the real shared/exterior walls, then `validatePlan` checks it.
  Errors are sent back to the AI for up to 4 attempts; the best attempt is kept even if it still has errors.
- 3 options (cost-efficient / balanced / spacious) are generated in parallel, one server action each
  (`maxDuration = 300` s on Vercel). Every call is logged in `AiGeneration` with token usage.
- Prices shown with options are a rough per-m² placeholder (`src/lib/pricing/rough.ts`) until the BOQ (M6).
- Requires `ANTHROPIC_API_KEY`.

## Milestones
- [x] M1 Project skeleton, TH/EN, optional password gate (single user — no accounts)
- [x] M2 Design brief form + plan data model, geometry, validator, metrics
- [x] M3 AI floor-plan generation (Claude API) + validator retry loop + natural-language edits
- [ ] M4 2D editor
- [ ] M5 3D viewer + materials
- [ ] M6 Excel price import + BOQ
- [ ] M7 Building-regulation rules engine (Bangkok first)
- [ ] M8 Versions + approvals
- [ ] M9 Quotation / contract PDF
