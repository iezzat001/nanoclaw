export interface GeminiPart {
  text: string;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiGenerateTextOptions {
  apiKey: string;
  model: string;
  contents: GeminiContent[];
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export async function geminiGenerateText(
  opts: GeminiGenerateTextOptions,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? 60000,
  );

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      opts.model,
    )}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

    const body = {
      contents: opts.contents,
      systemInstruction: opts.systemInstruction
        ? { parts: [{ text: opts.systemInstruction }] }
        : undefined,
      generationConfig: {
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Gemini API error (${res.status}): ${text}`);
    }

    const json = JSON.parse(text) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const parts = json.candidates?.[0]?.content?.parts;
    const out = (parts || [])
      .map((p) => p.text || '')
      .join('')
      .trim();

    if (!out) throw new Error('Gemini returned empty response');
    return out;
  } finally {
    clearTimeout(timeout);
  }
}
