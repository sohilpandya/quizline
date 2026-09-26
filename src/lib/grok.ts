import { z } from "zod";

const BASE_URL = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL ?? "grok-4.3";

async function callGrok(system: string, user: string, jsonMode: boolean, model = MODEL): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Grok ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** Ask Grok for JSON matching `schema`; retries once, then returns null so callers fall back. */
export async function grokJson<T>(schema: z.ZodType<T>, system: string, user: string, model?: string): Promise<T | null> {
  if (!process.env.XAI_API_KEY) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await callGrok(system + "\nRespond with a single JSON object only.", user, true, model);
      const cleaned = text.replace(/^```(json)?/m, "").replace(/```\s*$/m, "").trim();
      const parsed = schema.safeParse(JSON.parse(cleaned));
      if (parsed.success) return parsed.data;
      console.warn("Grok JSON failed validation", parsed.error.issues.slice(0, 3));
    } catch (e) {
      console.warn("Grok call failed", e);
    }
  }
  return null;
}

export async function grokText(system: string, user: string): Promise<string | null> {
  if (!process.env.XAI_API_KEY) return null;
  try {
    return (await callGrok(system, user, false)).trim() || null;
  } catch (e) {
    console.warn("Grok text failed", e);
    return null;
  }
}
