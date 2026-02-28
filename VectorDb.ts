import { pipeline, env } from '@huggingface/transformers';

env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('/');

const DB_NAME = 'VectorDb';
const STORE_NAME = 'entries';
const DB_VERSION = 1;

interface Entry {
  id: string;
  text: string;
  url: string;
  vector: Float32Array;
}

export interface SearchResult {
  id: string;
  text: string;
  url: string;
  score: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(db: IDBDatabase): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, entry: Entry): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbClear(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export class VectorDb {
  private extractor: any = null;
  private entries: Entry[] = [];
  private db: IDBDatabase | null = null;

  async init() {
    this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { device: 'wasm' });
    this.db = await openDb();
    this.entries = await idbGetAll(this.db);
    console.log(`VectorDb restored ${this.entries.length} entries from IndexedDB`);
  }

  async add(id: string, text: string, url: string) {
    const vector = await this.embed(text);
    const entry = { id, text, url, vector };
    this.entries.push(entry);
    await idbPut(this.db!, entry);
  }

  async addMany(items: { id: string; text: string; url: string }[]) {
    const texts = items.map(i => i.text);
    const out = await this.extractor(texts, { pooling: 'mean', normalize: true });
    const dim = out.dims[1];
    for (let i = 0; i < items.length; i++) {
      const entry = { id: items[i].id, text: items[i].text, url: items[i].url, vector: out.data.slice(i * dim, (i + 1) * dim) };
      this.entries.push(entry);
      await idbPut(this.db!, entry);
    }
  }

  async search(query: string, k = 5): Promise<SearchResult[]> {
    const queryVec = await this.embed(query);
    return this.entries
      .map(e => ({ id: e.id, text: e.text, url: e.url, score: cosine(e.vector, queryVec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  async delete(id: string) {
    this.entries = this.entries.filter(e => e.id !== id);
    await idbDelete(this.db!, id);
  }

  async clear() {
    this.entries = [];
    await idbClear(this.db!);
  }

  get size() {
    return this.entries.length;
  }

  private async embed(text: string): Promise<Float32Array> {
    const out = await this.extractor(text, { pooling: 'mean', normalize: true });
    return out.data;
  }
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
