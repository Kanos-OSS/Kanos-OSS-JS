import OpenAI from "openai";

export const replicAI = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "missing-key",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// minimax/openrouter responses begin with leading whitespace that confuses the OpenAI SDK's body parser
const trimFetch: typeof fetch = async (url, init) => {
  const res = await fetch(url, init);
  const text = await res.text();
  return new Response(text.trimStart(), { status: res.status, statusText: res.statusText, headers: res.headers });
};

export const minimaxAI = new OpenAI({
  apiKey: process.env.MINIMAX_KEY || "missing-key",
  baseURL: "https://openrouter.ai/api/v1",
  fetch: trimFetch,
});

export const AI_MODEL = "minimax/minimax-m2.5";
