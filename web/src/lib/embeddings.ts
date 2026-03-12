const MISTRAL_EMBED_URL = "https://api.mistral.ai/v1/embeddings";
const MISTRAL_MODEL = "mistral-embed";

export async function embedText(text: string): Promise<number[]> {
  const key = process.env.MISTRAL_API_KEY!;

  const res = await fetch(MISTRAL_EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MISTRAL_MODEL, input: [text] }),
  });

  if (!res.ok) {
    throw new Error(`Mistral embed failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}
