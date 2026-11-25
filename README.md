# House Design for Sales — ระบบออกแบบบ้านสำหรับเซลล์

Web app ให้เซลล์บริษัทรับสร้างบ้านรับโจทย์ลูกค้า → สร้างแปลนด้วย AI → ปรับแก้แปลน 2D และเลือกวัสดุ → ประเมินราคา BOQ → ตรวจกฎหมายเบื้องต้น → ออกใบเสนอราคา

> ⚠️ แบบและราคาในระบบเป็น **แบบร่างเพื่อการขาย** ไม่ใช่แบบก่อสร้าง ต้องให้สถาปนิก/วิศวกรผู้มีใบอนุญาตตรวจรับรองก่อนใช้งานจริง

## User manual
See [docs/manual/index.html](docs/manual/index.html) (Thai, with screenshots).

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
1. Import the GitHub repo in Vercel (Add New → Project). Vercel runs the `vercel-build` script automatically (migrations + build); no build-command change is needed.
2. Add a database: project → **Storage** → **Neon** (Postgres) → Connect. The integration's variables (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_*`) are picked up automatically — you do not need to set `DIRECT_URL` (see `scripts/db-env.mjs`).
3. Settings → Environment Variables:
   - `APP_PASSWORD` — **recommended**: the app has no user accounts, so without this anyone with the URL can use it (and your Claude API credits)
   - `ANTHROPIC_API_KEY` — for AI floor plans
4. Redeploy (Deployments → ⋯ → Redeploy) after adding the database or variables.
5. Nothing to seed by hand: every deploy adds any missing reference data (regulation rules, sample material catalogue, company settings) via `prisma/seed-reference.ts`. It never overwrites or deletes existing rows, so admin edits are kept. Sample customers/projects come only from `npm run db:seed` (local development — it wipes the database).

## AI floor plans (M3)
- Model: `claude-opus-5-5` (adaptive thinking, effort `high`), structured JSON output, server-side refusal fallback (`fallbacks: "default"`).
- The AI returns room rectangles + which rooms connect + which sides get windows (`src/lib/ai/format.ts`);
  code places doors/windows on the real shared/exterior walls, then `validatePlan` checks it.
  Errors are sent back to the AI for up to 4 attempts; the best attempt is kept even if it still has errors.
- 3 options (cost-efficient / balanced / spacious) are generated in parallel, one server action each
  (`maxDuration = 300` s on Vercel). Every call is logged in `AiGeneration` with token usage.
- Prices shown with options are a rough per-m² placeholder (`src/lib/pricing/rough.ts`) until the BOQ (M6).
- Requires `ANTHROPIC_API_KEY`.

## 2D editor (M4)
`/projects/:id/edit?v=<versionId>` — SVG editor over the same Plan JSON.
- Move rooms, drag walls (neighbouring rooms follow; Alt = this room only), draw rooms, add/slide/resize doors, windows, sliding doors and open passages.
- Grid snap (0.1/0.25/0.5 m) + magnetic snap to other rooms' walls and the floor below; linked stairs move together on all floors.
- Doors/windows keep their real-world position when a wall moves; they shrink if a wall gets too short.
- Chain dimensions, live plan check (click an issue to jump to the room), undo/redo, keyboard shortcuts.
- Saving always creates a new version; the source version is never overwritten.
- Editing logic is pure and unit-tested in `src/lib/editor/` (`ops.ts`, `history.ts`).

## Materials & price (M5 — 3D removed)
`/projects/:id/design?v=<versionId>` — spec packages (Standard/Premium/Luxury) and per-item materials with live price changes (+/− per option, vs the package and vs the saved version). 3D visualisation was dropped on request: architects produce 3D from the DXF export.
- Materials live in the `Material` table (sample prices seeded). Pricing = base rate × area + Σ quantity × (material − standard default) — `src/lib/pricing/materials.ts`; quantities from `takeoff()` in plan-core, which the BOQ (M6) will reuse.

## Building-regulation checks (M7)
Preliminary only — every screen says it must be certified by a licensed architect/engineer.
- Rules are data per area (`Jurisdiction` → `RuleSet` → `Rule`), edited at `/settings/rules`; each rule type has a typed parameter schema and an evaluator in `src/lib/compliance/rules.ts` (unit-tested).
- Rule types: opening/balcony distance to boundary (2 m / 3 m by height, blank walls 0.5 m or on the line with consent, road side = warning), road-centreline setback for roads < 6 m, 1/10-road-width setback for commercial types, height vs road width, high-rise threshold, FAR/OSR by land-use zone, minimum parking.
- Defaults (`src/lib/compliance/defaults.ts`) cite the Ministerial Regulation articles they come from and ship **unverified**; Bangkok FAR/OSR zone values are intentionally empty until entered from the comprehensive plan in force.
- The buildable envelope (red dashed line) is now computed from the rules instead of a fixed 2 m.
- Results show ✅/⚠️/❌ with explanations and source; violations are drawn on the plan, live in the 2D editor.
- Projects pick the area whose Thai name matches the province, else Bangkok rules for Bangkok, else national defaults.

## Approvals & versions (M8)
- Status workflow `DRAFT → PROPOSED → PRICE_APPROVAL → DESIGN_REVIEW → APPROVED → CONTRACT_SIGNED → PERMIT_PREP`, enforced on the server by `src/lib/workflow.ts` (unit-tested); no step can be skipped.
- Discounts up to `CompanySettings.salesDiscountLimitPct` (default 3%) are approved automatically; larger ones go to the sales manager.
- Architect and engineer review at `/projects/:id/review`: pinned comments on the plan, approve (licence number required) or request changes.
- `PERMIT_PREP` requires licensed architect **and** engineer approval of the contracted version.
- Saving a new version during approval voids pending approvals (back to PROPOSED); after the contract the design is locked.
- Prices carry a "ร่าง / DRAFT" badge until the price is approved.
- `/projects/:id/compare?a=&b=`: side-by-side plans, metric and price deltas, room and material changes; any old version can be restored (as a new version).
- No user accounts (single user): approver names and licence numbers are typed in and recorded with the decision.

## Elevations
Front / rear / left / right elevations are generated from the plan (`src/lib/plan-core/elevation.ts`, unit-tested): exterior wall faces turned to the viewer, doors and windows at real size and height (hidden ones left out), balcony railings, carport posts, the roof projected from its 3D surfaces (hip/gable/shed/butterfly/flat), ground line, floor levels and overall height. Shown on the project page, printed on quotations and written to the DXF (layers `A-ELEV`, `A-ELEV-OPNG`, `A-ELEV-DIMS`). Outline drawings only — no material detail.

## DXF export for AutoCAD (phase 2, pulled forward)
`GET /projects/:id/export/dxf?v=<versionId>&units=mm|m&lang=th|en` — button "⬇ DXF (AutoCAD)" on the project page.
- AutoCAD R12 ASCII DXF (opens in every AutoCAD version, BricsCAD, LibreCAD…), millimetres by default; floors side by side, each with plot, setbacks and road.
- Layers: `A-WALL` walls (outlines with gaps at openings), `A-DOOR` doors with swing arcs / sliding panels, `A-GLAZ` windows, `A-STRS` stair treads, `A-AREA` room outlines, `A-OUTD` carport/balcony, `A-ROOF` eave line, `A-TEXT` room names + area, `A-DIMS` chain dimensions, `A-ANNO` titles/north arrow/not-for-construction note, `C-PROP` plot boundary, `C-SETB` setback line, `C-ROAD` road.
- Thai text is stored in the file's code page (ANSI_874) with a Tahoma text style.
- Not yet: electrical and sanitary layers (the plan has no MEP data yet), true DIMENSION entities (dimensions are lines + text), title block / sheet layout.
- Validated with ezdxf (strict load + audit: 0 errors); `src/lib/export/dxf.ts` is unit-tested.

## Quotations & contracts (M9)
- Project page → "ออกใบเสนอราคา" (Thai or English). Each quotation gets a number (QT-YYYY-NNNN) and a **snapshot** of everything printed, so issued documents never change.
- `/quotations/:id` and `/quotations/:id/contract`: A4 print layouts — "พิมพ์ / บันทึกเป็น PDF" uses the browser's Save-as-PDF, which renders Thai perfectly and needs no server-side PDF engine on Vercel.
- Content: logo/company, customer & project, floor plans, specification, price lines (base + material upgrades), discount, VAT, total in words (Thai/English), payment instalments, terms, price-base reference and date, sales-draft disclaimer, signature boxes.
- "ร่าง / DRAFT" watermark on every page unless the price was approved when the quotation was issued.
- Contract = admin-editable template with `{{placeholders}}` (wording must come from the company's legal team).
- `/settings/company`: company details, logo, VAT, validity, sales discount limit, payment instalments (must total 100%), quotation terms, contract templates. Empty fields fall back to sample text, flagged as such.

## Milestones
- [x] M1 Project skeleton, TH/EN, optional password gate (single user — no accounts)
- [x] M2 Design brief form + plan data model, geometry, validator, metrics
- [x] M3 AI floor-plan generation (Claude API) + validator retry loop + natural-language edits
- [x] M4 2D editor
- [x] M5 Materials & packages (3D viewer removed on request)
- [ ] M6 Excel price import + BOQ
- [x] M7 Building-regulation rules engine (Bangkok first)
- [x] M8 Versions + approvals
- [x] M9 Quotation / contract PDF
