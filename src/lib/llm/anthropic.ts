import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam, BetaToolResultBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { type LlmProvider, LlmRateLimitError, type RunInput } from "./types";

export function anthropicProvider(apiKey: string, model: string): LlmProvider {
  const client = new Anthropic({ apiKey });

  return {
    id: "anthropic",
    model,
    async run({ system, history, tools, execute, maxSteps = 6 }: RunInput) {
      const messages: BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));

      for (let step = 0; step < maxSteps; step++) {
        let res;
        try {
          res = await client.beta.messages.create({
            model,
            max_tokens: 16000,
            system,
            messages,
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters as Anthropic.Messages.Tool.InputSchema,
            })),
            output_config: { effort: "low" },
            // Güvenlik sınıflandırıcısı reddederse istek sunucu tarafında önerilen modelle tekrar çalışır.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          });
        } catch (err) {
          if (err instanceof Anthropic.RateLimitError) {
            throw new LlmRateLimitError("Claude API hız sınırına ulaşıldı, biraz sonra tekrar deneyin.");
          }
          throw err;
        }

        if (res.stop_reason === "refusal") return "Bu isteğe yanıt veremiyorum.";

        // Yanıt bloklarını (düşünce blokları dahil) değiştirmeden geri ekliyoruz.
        messages.push({ role: "assistant", content: res.content });

        const uses = res.content.filter((b) => b.type === "tool_use");
        if (res.stop_reason !== "tool_use" || !uses.length) {
          return res.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("\n");
        }

        const results: BetaToolResultBlockParam[] = await Promise.all(
          uses.map(async (u) => ({
            type: "tool_result" as const,
            tool_use_id: u.id,
            content: JSON.stringify(await execute(u.name, (u.input ?? {}) as Record<string, unknown>)),
          })),
        );
        messages.push({ role: "user", content: results });
      }
      return "Bu soruyu yanıtlamak için çok fazla adım gerekti; lütfen soruyu daraltın.";
    },
  };
}
