"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Plan, Point } from "@/lib/plan-core";
import { SitePlanSvg, siteSvgFrame } from "./SitePlanSvg";
import { addComment, decideDesign, setCommentResolved, type WfResult } from "@/app/projects/[id]/workflow-actions";

export interface CommentRow {
  id: string;
  author: string;
  role: "PRICE" | "ARCHITECTURE" | "ENGINEERING" | null;
  levelId: string | null;
  x: number | null;
  y: number | null;
  body: string;
  resolved: boolean;
  createdAt: string;
}
export interface DesignApprovalRow {
  id: string;
  type: "ARCHITECTURE" | "ENGINEERING";
  status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
  approver: string | null;
  licenseNo: string | null;
  note: string | null;
}

export function ReviewBoard({
  versionId,
  plan,
  comments,
  approvals,
  canDecide,
  locale,
}: {
  versionId: string;
  plan: Plan;
  comments: CommentRow[];
  approvals: DesignApprovalRow[];
  canDecide: boolean;
  locale: "th" | "en";
}) {
  const t = useTranslations("review");
  const tw = useTranslations("wf");
  const router = useRouter();
  const [levelIndex, setLevelIndex] = useState(0);
  const [pin, setPin] = useState<Point | null>(null);
  const [author, setAuthor] = useState("");
  const [role, setRole] = useState<"ARCHITECTURE" | "ENGINEERING" | "PRICE">("ARCHITECTURE");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const level = plan.levels[levelIndex];
  const frame = siteSvgFrame(plan.site);

  const run = (fn: () => Promise<WfResult>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) {
        after?.();
        router.refresh();
      } else setError(r.error[locale]);
    });

  const numbered = comments.map((c, i) => ({ ...c, n: i + 1 }));
  const pins = [
    ...numbered.filter((c) => c.levelId === level.id && c.x !== null && c.y !== null).map((c) => ({ x: c.x!, y: c.y!, label: String(c.n), resolved: c.resolved })),
    ...(pin ? [{ x: pin[0], y: pin[1], label: "+", active: true }] : []),
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-line bg-paper text-sm">
            {plan.levels.map((l, i) => (
              <button key={l.id} onClick={() => { setLevelIndex(i); setPin(null); }} className={`px-3 py-1.5 ${i === levelIndex ? "bg-accent text-white" : "hover:bg-bg"}`}>
                {l.name[locale]}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{t("clickHint")}</p>
        </div>
        <div className="card cursor-crosshair p-2" data-testid="review-plan">
          <SitePlanSvg
            site={plan.site}
            plan={plan}
            levelIndex={levelIndex}
            locale={locale}
            pins={pins}
            className="w-full"
            onSvgClick={(e) => {
              const svg = e.currentTarget;
              const pt = svg.createSVGPoint();
              pt.x = e.clientX;
              pt.y = e.clientY;
              const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
              setPin(frame.toSite(p.x, p.y));
            }}
          />
        </div>
      </div>

      <aside className="space-y-3">
        <div className="card space-y-2 p-4">
          <p className="font-semibold">{t("addComment")}</p>
          <p className="text-xs text-muted">{pin ? t("pinned", { level: level.name[locale] }) : t("noPin")}</p>
          <div className="flex gap-2">
            <input className="input" placeholder={t("yourName")} value={author} onChange={(e) => setAuthor(e.target.value)} />
            <select className="input w-40" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              {(["ARCHITECTURE", "ENGINEERING", "PRICE"] as const).map((r) => (
                <option key={r} value={r}>
                  {t(`role_${r}`)}
                </option>
              ))}
            </select>
          </div>
          <textarea className="input h-20" placeholder={t("commentPlaceholder")} value={body} onChange={(e) => setBody(e.target.value)} />
          <button
            className="btn-primary w-full"
            disabled={pending}
            onClick={() =>
              run(
                () => addComment(versionId, { author, role, levelId: pin ? level.id : null, x: pin?.[0] ?? null, y: pin?.[1] ?? null, body }),
                () => {
                  setBody("");
                  setPin(null);
                },
              )
            }
          >
            {t("post")}
          </button>
        </div>

        <div className="card space-y-2 p-4" data-testid="comments">
          <p className="font-semibold">{t("comments", { n: comments.filter((c) => !c.resolved).length })}</p>
          {numbered.length === 0 && <p className="text-sm text-muted">{t("noComments")}</p>}
          <ul className="space-y-2 text-sm">
            {numbered.map((c) => (
              <li key={c.id} className={`rounded-md border border-line p-2 ${c.resolved ? "opacity-60" : ""}`}>
                <div className="flex items-baseline gap-2">
                  <span className={`grid h-5 w-5 place-items-center rounded-full text-xs font-bold text-white ${c.resolved ? "bg-muted" : "bg-bad"}`}>{c.n}</span>
                  <span className="font-medium">{c.author}</span>
                  {c.role && <span className="text-xs text-muted">{t(`role_${c.role}`)}</span>}
                  {c.levelId && <span className="text-xs text-muted">· {plan.levels.find((l) => l.id === c.levelId)?.name[locale]}</span>}
                  <label className="ml-auto flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={c.resolved} onChange={(e) => run(() => setCommentResolved(c.id, e.target.checked))} />
                    {t("resolved")}
                  </label>
                </div>
                <p className={`mt-1 ${c.resolved ? "line-through" : ""}`}>{c.body}</p>
              </li>
            ))}
          </ul>
        </div>

        {approvals.map((a) => (
          <DecisionCard key={a.id} approval={a} canDecide={canDecide && a.status === "PENDING"} pending={pending} onDecide={(input) => run(() => decideDesign(a.id, input))} label={tw(`type_${a.type}`)} />
        ))}
        {error && <p className="text-sm text-bad" data-testid="review-error">{error}</p>}
      </aside>
    </div>
  );
}

function DecisionCard({
  approval,
  canDecide,
  pending,
  onDecide,
  label,
}: {
  approval: DesignApprovalRow;
  canDecide: boolean;
  pending: boolean;
  onDecide: (input: { approver: string; licenseNo: string; approve: boolean; note: string }) => void;
  label: string;
}) {
  const t = useTranslations("review");
  const [approver, setApprover] = useState("");
  const [licenseNo, setLicense] = useState("");
  const [note, setNote] = useState("");
  const icon = approval.status === "APPROVED" ? "✅" : approval.status === "PENDING" ? "⏳" : "↩️";
  return (
    <div className="card space-y-2 p-4" data-testid={`decide-${approval.type}`}>
      <p className="font-semibold">
        {icon} {label}
      </p>
      {approval.status !== "PENDING" ? (
        <p className="text-sm">
          {approval.approver} {approval.licenseNo && <span className="text-muted">({approval.licenseNo})</span>}
          {approval.note && <span className="block text-muted">“{approval.note}”</span>}
        </p>
      ) : canDecide ? (
        <>
          <input className="input" placeholder={t("reviewerName")} value={approver} onChange={(e) => setApprover(e.target.value)} />
          <input className="input" placeholder={t("licenseNo")} value={licenseNo} onChange={(e) => setLicense(e.target.value)} />
          <textarea className="input h-16" placeholder={t("decisionNote")} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={pending} onClick={() => onDecide({ approver, licenseNo, approve: true, note })}>
              {t("approveDesign")}
            </button>
            <button className="btn-ghost flex-1" disabled={pending} onClick={() => onDecide({ approver, licenseNo, approve: false, note })}>
              {t("requestChanges")}
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">{t("notInReview")}</p>
      )}
    </div>
  );
}
