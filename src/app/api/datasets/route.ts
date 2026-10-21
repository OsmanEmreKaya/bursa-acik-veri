import { connection } from "next/server";
import { catalog } from "@/lib/datasets";

export async function GET() {
  await connection();
  return Response.json(await catalog());
}
