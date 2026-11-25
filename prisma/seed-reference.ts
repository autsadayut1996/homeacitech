/* Run on every deploy: adds missing reference data, never touches existing rows or projects. */
import { PrismaClient } from "@prisma/client";
import { ensureReferenceData } from "./reference";

const db = new PrismaClient();
ensureReferenceData(db)
  .then((created) => console.log(created.length ? `Reference data added: ${created.join(", ")}` : "Reference data already present"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
