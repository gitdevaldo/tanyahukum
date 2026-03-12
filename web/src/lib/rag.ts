import { getDb } from "./mongodb";
import { embedText } from "./embeddings";

export async function searchRegulations(
  query: string,
  limit: number = 10
): Promise<any[]> {
  const db = await getDb();
  const collection = db.collection("legal_chunks");
  const queryEmbedding = await embedText(query);

  const results = await collection
    .aggregate([
      {
        $vectorSearch: {
          index: "vector_index",
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: limit * 10,
          limit,
        },
      },
      {
        $project: {
          _id: 0,
          doc_id: 1,
          pasal_ref: 1,
          content: 1,
          source: 1,
          bentuk: 1,
          nomor: 1,
          tahun: 1,
          subjek: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();

  return results;
}
