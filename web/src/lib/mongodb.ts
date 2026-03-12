import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB = process.env.MONGODB_DB || "tanyahukum";

let cachedClient: MongoClient | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (cachedClient) return cachedClient;
  cachedClient = await new MongoClient(MONGODB_URI).connect();
  return cachedClient;
}

export async function getDb() {
  const client = await getMongoClient();
  return client.db(MONGODB_DB);
}
