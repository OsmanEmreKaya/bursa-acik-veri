// Sağlayıcıdan bağımsız LLM arayüzü. Her adaptör kendi araç çağırma döngüsünü
// kendi yerel mesaj biçimiyle yürütür; dışarıya yalnızca bu sade arayüzü gösterir.

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
};

export type RunInput = {
  system: string;
  history: ChatTurn[];
  tools: ToolSpec[];
  execute: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxSteps?: number;
};

export interface LlmProvider {
  id: string;
  model: string;
  run(input: RunInput): Promise<string>;
}

export class LlmConfigError extends Error {}
export class LlmRateLimitError extends Error {}
export class LlmBusyError extends Error {}
