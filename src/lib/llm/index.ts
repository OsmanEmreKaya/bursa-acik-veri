import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { openAiCompatibleProvider } from "./openai-compatible";
import { LlmConfigError, type LlmProvider } from "./types";

export * from "./types";

// LLM_PROVIDER ortam değişkeniyle seçilir; LLM_MODEL boş bırakılırsa aşağıdaki varsayılan kullanılır.
const DEFAULT_MODELS: Record<string, string> = {
  gemini: "gemini-flash-latest",
  groq: "llama-3.3-70b-versatile",
  ollama: "qwen3:8b",
  openai: "gpt-5-mini",
  anthropic: "claude-opus-5-5",
};

function requireKey(name: string): string {
  const v = process.env[name];
  if (!v) throw new LlmConfigError(`${name} tanımlı değil. .env.local dosyasına ekleyip sunucuyu yeniden başlatın.`);
  return v;
}

export function getProvider(): LlmProvider {
  const id = (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();
  const model = process.env.LLM_MODEL || DEFAULT_MODELS[id];

  switch (id) {
    case "gemini":
      return geminiProvider(
        requireKey("GEMINI_API_KEY"),
        model,
        process.env.LLM_FALLBACK_MODEL || (process.env.LLM_MODEL ? undefined : "gemini-flash-lite-latest"),
      );
    case "groq":
      return openAiCompatibleProvider({
        id, model, apiKey: requireKey("GROQ_API_KEY"), baseURL: "https://api.groq.com/openai/v1",
      });
    case "ollama":
      return openAiCompatibleProvider({
        id, model, apiKey: "ollama", baseURL: `${process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"}/v1`,
      });
    case "openai":
      return openAiCompatibleProvider({ id, model, apiKey: requireKey("OPENAI_API_KEY") });
    case "anthropic":
      return anthropicProvider(requireKey("ANTHROPIC_API_KEY"), model);
    default:
      throw new LlmConfigError(
        `Bilinmeyen LLM_PROVIDER: '${id}'. Geçerli değerler: ${Object.keys(DEFAULT_MODELS).join(", ")}.`,
      );
  }
}
