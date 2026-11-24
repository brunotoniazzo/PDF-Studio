export interface CachedBitmapEntry {
  key: string;
  docId: string;
  pageIndex: number;
  bitmap: ImageBitmap;
  byteSize: number;
}

/**
 * Cache LRU controlado por orçamento real em bytes (width * height * 4).
 * Ao expulsar ou invalidar qualquer item, invoca explicitamente bitmap.close()
 * para liberar imediatamente a textura na GPU e evitar vazamentos gráficos.
 */
export class LruBitmapCache {
  private readonly map = new Map<string, CachedBitmapEntry>();
  private currentBytes = 0;

  constructor(private readonly maxBytes: number = 200 * 1024 * 1024) {}

  get usedBytes(): number {
    return this.currentBytes;
  }

  get size(): number {
    return this.map.size;
  }

  get(key: string): ImageBitmap | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Move para o fim (mais recentemente usado)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.bitmap;
  }

  set(docId: string, pageIndex: number, key: string, bitmap: ImageBitmap): void {
    const existing = this.map.get(key);
    if (existing) {
      if (existing.bitmap !== bitmap) {
        try {
          existing.bitmap.close();
        } catch {
          // ignora caso já fechado
        }
      }
      this.currentBytes -= existing.byteSize;
      this.map.delete(key);
    }

    const byteSize = bitmap.width * bitmap.height * 4;
    // Se um único bitmap for maior que o orçamento total, ainda assim expulsa os antigos
    while (this.map.size > 0 && this.currentBytes + byteSize > this.maxBytes) {
      const oldestKey = this.map.keys().next().value;
      if (!oldestKey) break;
      this.evictKey(oldestKey);
    }

    this.map.set(key, { key, docId, pageIndex, bitmap, byteSize });
    this.currentBytes += byteSize;
  }

  invalidatePage(docId: string, pageIndex: number): void {
    for (const [key, entry] of [...this.map.entries()]) {
      if (entry.docId === docId && entry.pageIndex === pageIndex) {
        this.evictKey(key);
      }
    }
  }

  invalidateDocument(docId: string): void {
    for (const [key, entry] of [...this.map.entries()]) {
      if (entry.docId === docId) {
        this.evictKey(key);
      }
    }
  }

  clear(): void {
    for (const key of [...this.map.keys()]) {
      this.evictKey(key);
    }
    this.currentBytes = 0;
  }

  private evictKey(key: string): void {
    const entry = this.map.get(key);
    if (!entry) return;
    this.map.delete(key);
    this.currentBytes = Math.max(0, this.currentBytes - entry.byteSize);
    try {
      entry.bitmap.close();
    } catch {
      // ignora caso já fechado
    }
  }
}
