import { z } from "zod";
import { DEMO_GRAPH } from "@/lib/constants";

const emptyToUndefined = (val: unknown) => (typeof val === "string" && val.trim() === "" ? undefined : val);
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const environmentSchema = z.object({
  FALKORDB_URL: optionalUrl,
  FALKORDB_HOST: z.preprocess(emptyToUndefined, z.string().min(1).default("127.0.0.1")),
  FALKORDB_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(6379)),
  FALKORDB_GRAPH: z.preprocess(emptyToUndefined, z.string().min(1).default(DEMO_GRAPH)),
  FALKORDB_USERNAME: optionalString,
  FALKORDB_PASSWORD: optionalString,
  FALKORDB_TLS: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).default("false")),
});

export function getEnvironment() {
  const parsed = environmentSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error("FalkorDB environment settings are invalid. Check .env.local or deployment variables.");
  }

  return { ...parsed.data, FALKORDB_TLS: parsed.data.FALKORDB_TLS === "true" };
}
