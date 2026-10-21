import { ApiError, type Content, GoogleGenAI, type Part } from "@google/genai";
import { LlmBusyError, type LlmProvider, LlmRateLimitError, type RunInput } from "./types";

export function geminiProvider(apiKey: string, model: string, fallbackModel?: string): LlmProvider {
  const ai = new GoogleGenAI({
    apiKey,
    // SDK varsayılan olarak 429'da 5 kez, 60 sn'ye varan beklemelerle yeniden dener;
    // sohbet arayüzünde kullanıcıyı dakikalarca bekletmemek için bunu kısıyoruz.
    httpOptions: { timeout: 45_000, retryOptions: { attempts: 2, maxDelay: 5 } },
  });

  return {
    id: "gemini",
    model,
    async run({ system, history, tools, execute, maxSteps = 6 }: RunInput) {
      const contents: Content[] = history.map((t) => ({
        role: t.role === "assistant" ? "model" : "user",
        parts: [{ text: t.content }],
      }));
      const config = {
        systemInstruction: system,
        tools: [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parametersJsonSchema: t.parameters,
            })),
          },
        ],
      };

      let activeModel = model;
      for (let step = 0; step < maxSteps; step++) {
        let res;
        try {
          res = await ai.models.generateContent({ model: activeModel, contents, config });
        } catch (err) {
          if (!(err instanceof ApiError)) throw err;
          if (err.status === 429) throw new LlmRateLimitError("Gemini ücretsiz kotası doldu, biraz sonra tekrar deneyin.");
          if (err.status < 500) throw err;
          // Model yoğunsa (503) ilk adımda daha hafif modele geçilir. Sonraki adımlarda geçilmez:
          // önceki araç çağrılarının düşünce imzaları ilk modele bağlıdır.
          if (step === 0 && fallbackModel && fallbackModel !== activeModel) {
            activeModel = fallbackModel;
            step--;
            continue;
          }
          throw new LlmBusyError("Gemini şu an çok yoğun. Birkaç saniye sonra tekrar deneyin.");
        }

        const calls = res.functionCalls;
        if (!calls?.length) return res.text ?? "";

        // Modelin yanıtını olduğu gibi geri ekliyoruz: düşünce imzaları (thought
        // signature) korunmazsa sonraki adımda araç çağrısı bağlamı kaybolur.
        const modelContent = res.candidates?.[0]?.content;
        if (modelContent) contents.push(modelContent);

        const parts: Part[] = await Promise.all(
          calls.map(async (c) => ({
            functionResponse: {
              id: c.id,
              name: c.name,
              response: { result: await execute(c.name ?? "", c.args ?? {}) },
            },
          })),
        );
        contents.push({ role: "user", parts });
      }
      return "Bu soruyu yanıtlamak için çok fazla adım gerekti; lütfen soruyu daraltın.";
    },
  };
}
