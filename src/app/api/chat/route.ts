import { type ChatTurn, getProvider, LlmBusyError, LlmConfigError, LlmRateLimitError } from "@/lib/llm";
import type { LngLat } from "@/lib/geo";
import type { MapAction } from "@/lib/map-actions";
import { TOOLS, type ToolContext } from "@/lib/tools";

type Body = {
  messages: ChatTurn[];
  context?: { userLocation?: LngLat; mapCenter?: LngLat };
};

function systemPrompt(ctx: ToolContext): string {
  const now = new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "full", timeStyle: "short" });
  return [
    "Sen Bursa Açık Veri Platformu'nun asistanısın. Kullanıcılar Bursa hakkındaki canlı açık verilere doğal dille soru sorar.",
    `Şu an: ${now} (Türkiye saati).`,
    "Kurallar:",
    "- Veriye dayalı her soruda önce ilgili aracı çağır; sayı, tarih veya yer uydurma. Araç sonucu boşsa bunu açıkça söyle.",
    "- Araçlar haritayı otomatik günceller; kullanıcıya 'haritada işaretledim' gibi kısaca belirtebilirsin.",
    "- Kısa ve net Türkçe yanıt ver. Gerektiğinde madde işaretleri kullan, uzun tablolardan kaçın.",
    "- Yanıtın sonunda veri kaynağını tek satırla belirt; kaynağı her zaman araç sonucundaki 'kaynak' alanından al, tahmin etme.",
    "- Afet toplanma alanı veya deprem sorularında sakin ve bilgilendirici ol; resmi kurumlara (AFAD, 112) yönlendirmeyi unutma.",
    "- Platformdaki veriler dışında kalan sorularda bunu belirt ve mevcut veri setlerini öner.",
    ctx.userLocation
      ? `Kullanıcı konumunu paylaştı: enlem ${ctx.userLocation[1].toFixed(5)}, boylam ${ctx.userLocation[0].toFixed(5)}.`
      : "Kullanıcı konumunu paylaşmadı; 'yakınımda' gibi sorularda harita merkezi kullanılır.",
  ].join("\n");
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Geçersiz istek" }, { status: 400 });
  }
  const history = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12);
  if (!history.length || history[history.length - 1].role !== "user") {
    return Response.json({ error: "Son mesaj kullanıcıdan gelmeli" }, { status: 400 });
  }

  const ctx: ToolContext = body.context ?? {};
  const actions: MapAction[] = [];
  const trace: { tool: string; args: Record<string, unknown>; ok: boolean }[] = [];

  try {
    const provider = getProvider();
    const reply = await provider.run({
      system: systemPrompt(ctx),
      history,
      tools: TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters })),
      execute: async (name, args) => {
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) {
          trace.push({ tool: name, args, ok: false });
          return { hata: `Bilinmeyen araç: ${name}` };
        }
        try {
          const out = await tool.run(args, ctx);
          actions.push(...(out.actions ?? []));
          trace.push({ tool: name, args, ok: true });
          return out.result;
        } catch (err) {
          trace.push({ tool: name, args, ok: false });
          return { hata: `Veri kaynağına ulaşılamadı: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    });
    return Response.json({ reply, actions, trace, provider: provider.id, model: provider.model });
  } catch (err) {
    if (err instanceof LlmConfigError) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof LlmRateLimitError) return Response.json({ error: err.message }, { status: 429 });
    if (err instanceof LlmBusyError) return Response.json({ error: err.message }, { status: 503 });
    console.error("[chat]", err);
    return Response.json({ error: "Asistan şu an yanıt veremedi. Biraz sonra tekrar deneyin." }, { status: 502 });
  }
}
