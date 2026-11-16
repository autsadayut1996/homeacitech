import type { Brief, Customer, Project } from "@prisma/client";
import { EMPTY_BRIEF, type BriefFormValues } from "@/components/BriefForm";
import type { Land, Requirements } from "./brief";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Stored project → editable form strings. */
export function briefToForm(project: Project & { customer: Customer; brief: Brief | null }): BriefFormValues {
  const b = project.brief;
  const land = (b?.land ?? {}) as Partial<Land>;
  const req = (b?.requirements ?? {}) as Partial<Requirements>;
  return {
    title: project.title,
    customer: { name: project.customer.name, phone: s(project.customer.phone), email: s(project.customer.email), note: s(project.customer.note) },
    land: {
      shape: land.shape ?? "rect",
      widthM: s(land.widthM),
      depthM: s(land.depthM),
      cornersText: (land.corners ?? []).map((p) => p.join(",")).join("\n"),
      areaSqWa: s(land.areaSqWa),
      frontFacing: land.frontFacing ?? "N",
      roads: (land.roads ?? EMPTY_BRIEF.land.roads).map((r) => ({ side: r.side, widthM: s(r.widthM) })),
      province: land.province ?? "",
      district: s(land.district),
    },
    requirements: {
      buildingType: req.buildingType ?? EMPTY_BRIEF.requirements.buildingType,
      floors: s(req.floors),
      bedrooms: s(req.bedrooms),
      bathrooms: s(req.bathrooms),
      parking: s(req.parking),
      specialRooms: req.specialRooms ?? [],
      targetAreaM2: s(req.targetAreaM2),
      style: req.style ?? EMPTY_BRIEF.requirements.style,
    },
    budgetMin: s(b?.budgetMin),
    budgetMax: s(b?.budgetMax),
    freeText: s(b?.freeText),
  };
}
