// Ollama client for the two-stage NLU — the impure half of the parser seam.
// The R3 winning recipe: qwen3:8b, temperature 0, think:false, structured
// output via the format field (constrained decoding guarantees the JSON
// shape; the prompts and schemas live in src/lib/intentParser).
import type { LlmChat } from "../src/lib/intentParser";

export function ollamaChat(url: string, model: string): LlmChat {
  return async (system, user, format) => {
    const body: Record<string, unknown> = {
      model,
      stream: false,
      format,
      options: { temperature: 0 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
    // think:false is the qwen3 latency trick from R3; other model families
    // reject the field, so gate it on the family.
    if (model.startsWith("qwen3")) body.think = false;
    const res = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`ollama HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return ((await res.json()) as { message: { content: string } }).message.content;
  };
}
