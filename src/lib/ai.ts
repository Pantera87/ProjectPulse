/**
 * AI provider seam.
 *
 * Default is a no-op provider: every method returns null and callers fall
 * back to heuristics. Setting OLLAMA_URL (e.g. http://localhost:11434) with
 * AI_ENABLED != "false" switches to the Ollama provider for:
 *   - summarizing changes
 *   - extracting goals from pages without a usable description
 *   - semantic keyword matching
 */

export interface AIProvider {
  readonly enabled: boolean;
  summarize(diff: string, context: string): Promise<string | null>;
  extractGoal(htmlText: string): Promise<string | null>;
  /** Does this text semantically relate to any of the keywords? */
  semanticallyMatches(text: string, keywords: string[]): Promise<boolean | null>;
}

class NullProvider implements AIProvider {
  readonly enabled = false;
  async summarize(): Promise<string | null> {
    return null;
  }
  async extractGoal(): Promise<string | null> {
    return null;
  }
  async semanticallyMatches(): Promise<boolean | null> {
    return null;
  }
}

class OllamaProvider implements AIProvider {
  readonly enabled = true;
  private url: string;
  private model: string;

  constructor(url: string, model: string) {
    this.url = url.replace(/\/$/, "");
    this.model = model;
  }

  private async generate(prompt: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.url}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: { temperature: 0.1, num_predict: 300 },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { response?: string };
      const out = (json.response ?? "").trim();
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  }

  async summarize(diff: string, context: string): Promise<string | null> {
    const d = diff.length > 4000 ? diff.slice(0, 4000) : diff;
    return this.generate(
      `Summarize these changes to the project "${context}" in one or two plain sentences. No preamble.\n\n${d}`
    );
  }

  async extractGoal(htmlText: string): Promise<string | null> {
    const t = htmlText.length > 3000 ? htmlText.slice(0, 3000) : htmlText;
    return this.generate(
      `In one sentence (max 25 words), what is the main goal/purpose of the software described below?\n\n${t}`
    );
  }

  async semanticallyMatches(text: string, keywords: string[]): Promise<boolean | null> {
    const t = text.length > 3000 ? text.slice(0, 3000) : text;
    const out = await this.generate(
      `Does the following text relate to any of these topics: ${keywords.join(
        ", "
      )}? Answer with a single word: yes or no.\n\n${t}`
    );
    if (!out) return null;
    if (/^yes\b/i.test(out)) return true;
    if (/^no\b/i.test(out)) return false;
    return null;
  }
}

let provider: AIProvider | null = null;

export function getAI(): AIProvider {
  if (provider) return provider;
  const url = process.env.OLLAMA_URL;
  if (url && process.env.AI_ENABLED !== "false") {
    const model = process.env.OLLAMA_MODEL || "qwen2.5:1.5b";
    provider = new OllamaProvider(url, model);
  } else {
    provider = new NullProvider();
  }
  return provider;
}
