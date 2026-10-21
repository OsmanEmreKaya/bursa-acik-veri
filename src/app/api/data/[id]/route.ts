import type { NextRequest } from "next/server";
import { cacheInfo } from "@/lib/cache";
import { getDataset, isDatasetId, toCsv } from "@/lib/datasets";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/data/[id]">) {
  const { id } = await ctx.params;
  if (!isDatasetId(id)) return Response.json({ error: "Böyle bir veri seti yok" }, { status: 404 });

  try {
    const data = await getDataset(id);
    const { fetchedAt } = cacheInfo(id);
    const headers: Record<string, string> = {
      "Cache-Control": "public, max-age=60",
      "X-Fetched-At": fetchedAt ? new Date(fetchedAt).toISOString() : "",
    };

    if (req.nextUrl.searchParams.get("format") === "csv") {
      return new Response(toCsv(data), {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${id}.csv"`,
        },
      });
    }
    if (req.nextUrl.searchParams.has("download")) {
      headers["Content-Disposition"] = `attachment; filename="${id}.json"`;
    }
    return Response.json(data, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Kaynağa ulaşılamadı: ${message}` }, { status: 502 });
  }
}
