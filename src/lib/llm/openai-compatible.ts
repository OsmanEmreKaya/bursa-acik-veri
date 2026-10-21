import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { type LlmProvider, LlmRateLimitError, type RunInput } from "./types";

// Groq, Ollama ve OpenAI aynı Chat Completions arayüzünü konuştuğu için tek adaptör yeterli.
export function openAiCompatibleProvider(opts: {
  id: string;
  model: string;
  apiKey: string;
  baseURL?: string;
}): LlmProvider {
  const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });

  return {
    id: opts.id,
    model: opts.model,
    async run({ system, history, tools, execute, maxSteps = 6 }: RunInput) {
      const messages: ChatCompletionMessageParam[] = [{ role: "system", content: system }, ...history];
      const toolDefs = tools.map((t) => ({
        type: "function" as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));

      for (let step = 0; step < maxSteps; step++) {
        let res;
        try {
          res = await client.chat.completions.create({ model: opts.model, messages, tools: toolDefs });
        } catch (err) {
          if (err instanceof OpenAI.RateLimitError) {
            throw new LlmRateLimitError(`${opts.id} kotası doldu, biraz sonra tekrar deneyin.`);
          }
          throw err;
        }

        const msg = res.choices[0].message;
        const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
        if (!calls.length) return msg.content ?? "";

        messages.push(msg);
        for (const call of calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            // bozuk argüman gelirse boş nesneyle devam et; araç kendi varsayılanlarını kullanır
          }
          const result = await execute(call.function.name, args);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        }
      }
      return "Bu soruyu yanıtlamak için çok fazla adım gerekti; lütfen soruyu daraltın.";
    },
  };
}
