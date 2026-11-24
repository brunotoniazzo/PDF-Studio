import pdfiumWasmUrl from '@embedpdf/pdfium/pdfium.wasm?url';
import type {
  PdfEditableTextBlock,
  SearchMatch,
} from '@pdf-studio/platform-contracts';
import { LruBitmapCache } from './lruBitmapCache';
import type {
  ApplyRedactionsPayload,
  CommitMutationResult,
  CommitTextBlockPayload,
  OpenDocumentPayload,
  OpenDocumentResponse,
  PageCharsResult,
  RenderPagePayload,
  RenderPriority,
  RenderTilePayload,
  SearchDocumentPayload,
  WorkerRequestMessage,
  WorkerResponseMessage,
} from './workers/workerProtocol';

interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

interface ScheduledRenderTask {
  key: string;
  priority: RenderPriority;
  generation: number;
  docId: string;
  pageIndex: number;
  run: () => Promise<ImageBitmap | null>;
  resolvers: Array<{
    resolve: (bmp: ImageBitmap | null) => void;
    reject: (err: Error) => void;
  }>;
}

/**
 * Cliente Principal do Motor PDFium WASM:
 * - Gerencia o ciclo de vida do Web Worker dedicado;
 * - Implementa o Render Scheduler com 3 filas de prioridade (high / medium / low) e generation tokens;
 * - Integra o LruBitmapCache controlado por orçamento real em bytes (200 MB).
 */
export class PdfEngineClient {
  private worker: Worker | null = null;
  private initPromise: Promise<void> | null = null;
  private rpcSeq = 0;
  private readonly pendingRpcs = new Map<string, PendingRpc>();

  private renderGeneration = 1;
  private activeRenderTasks = 0;
  private readonly maxConcurrentRenders = 2;
  private readonly queues: Record<RenderPriority, ScheduledRenderTask[]> = {
    high: [],
    medium: [],
    low: [],
  };
  private readonly inFlightByKey = new Map<string, ScheduledRenderTask>();
  private readonly pageCharsCache = new Map<string, PageCharsResult>();

  public readonly bitmapCache = new LruBitmapCache(200 * 1024 * 1024);

  private ensureWorker(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const worker = new Worker(
        new URL('./workers/pdfium.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (ev: MessageEvent<WorkerResponseMessage>) => {
        const msg = ev.data;
        const pending = this.pendingRpcs.get(msg.id);
        if (!pending) return;
        this.pendingRpcs.delete(msg.id);

        if (msg.ok) {
          pending.resolve(msg.result);
        } else {
          const err = new Error(msg.error);
          (err as Error & { code?: string }).code = msg.errorCode;
          pending.reject(err);
        }
      };

      worker.onerror = (ev) => {
        console.error('[PdfEngineClient] Erro no Worker PDFium:', ev.message);
      };

      this.worker = worker;
      const resolvedWasmUrl = new URL(pdfiumWasmUrl, window.location.href).href;
      await this.sendRpc({ type: 'init', wasmUrl: resolvedWasmUrl });
    })();

    return this.initPromise;
  }

  private async sendRpc<T>(
    msgWithoutId: { type: WorkerRequestMessage['type']; [key: string]: unknown },
    transfer?: Transferable[]
  ): Promise<T> {
    if (msgWithoutId.type !== 'init') {
      await this.ensureWorker();
    }
    if (!this.worker) {
      throw new Error('Worker PDFium indisponível.');
    }

    const id = `rpc-${++this.rpcSeq}`;
    const fullMsg = { ...msgWithoutId, id } as WorkerRequestMessage;

    return await new Promise<T>((resolve, reject) => {
      this.pendingRpcs.set(id, {
        resolve: resolve as (val: unknown) => void,
        reject,
      });
      if (transfer && transfer.length > 0) {
        this.worker!.postMessage(fullMsg, transfer);
      } else {
        this.worker!.postMessage(fullMsg);
      }
    });
  }

  public bumpRenderGeneration(): number {
    this.renderGeneration += 1;
    // Descarta imediatamente da fila tarefas de gerações antigas (exceto miniaturas low-priority de 0 geração fixa)
    for (const prio of ['high', 'medium'] as const) {
      const kept: ScheduledRenderTask[] = [];
      for (const task of this.queues[prio]) {
        if (task.generation < this.renderGeneration) {
          this.inFlightByKey.delete(task.key);
          task.resolvers.forEach((r) => r.resolve(null));
        } else {
          kept.push(task);
        }
      }
      this.queues[prio] = kept;
    }

    if (this.worker) {
      void this.sendRpc({
        type: 'updateGeneration',
        generation: this.renderGeneration,
      }).catch(() => {});
    }
    return this.renderGeneration;
  }

  public get currentGeneration(): number {
    return this.renderGeneration;
  }

  public async openDocument(payload: OpenDocumentPayload): Promise<OpenDocumentResponse> {
    this.invalidateDocument(payload.docId);
    const bytesCopy = new Uint8Array(payload.bytes);
    return await this.sendRpc<OpenDocumentResponse>(
      {
        type: 'openDocument',
        payload: { ...payload, bytes: bytesCopy },
      },
      [bytesCopy.buffer]
    );
  }

  public async replaceDocumentBytes(
    payload: OpenDocumentPayload
  ): Promise<OpenDocumentResponse> {
    this.invalidateDocument(payload.docId);
    const bytesCopy = new Uint8Array(payload.bytes);
    return await this.sendRpc<OpenDocumentResponse>(
      {
        type: 'replaceDocumentBytes',
        payload: { ...payload, bytes: bytesCopy },
      },
      [bytesCopy.buffer]
    );
  }

  public async closeDocument(docId: string): Promise<void> {
    this.invalidateDocument(docId);
    await this.sendRpc({ type: 'closeDocument', docId });
  }

  public invalidatePage(docId: string, pageIndex: number): void {
    this.bitmapCache.invalidatePage(docId, pageIndex);
    this.pageCharsCache.delete(`${docId}:${pageIndex}`);
  }

  public invalidateDocument(docId: string): void {
    this.bitmapCache.invalidateDocument(docId);
    for (const k of [...this.pageCharsCache.keys()]) {
      if (k.startsWith(`${docId}:`)) {
        this.pageCharsCache.delete(k);
      }
    }
  }

  public async requestPageBitmap(
    params: Omit<RenderPagePayload, 'generation'> & {
      priority: RenderPriority;
      useLatestGeneration?: boolean;
    }
  ): Promise<ImageBitmap | null> {
    const w = Math.max(1, Math.round(params.widthPx));
    const h = Math.max(1, Math.round(params.heightPx));
    const cacheKey = `page:${params.docId}:${params.pageIndex}:${w}x${h}:rot${params.extraRotation ?? 0}:ann${params.includeAnnotations ? 1 : 0}`;

    const cached = this.bitmapCache.get(cacheKey);
    if (cached) return cached;

    const gen =
      params.priority === 'low' && params.useLatestGeneration === false
        ? this.renderGeneration
        : this.renderGeneration;

    return await this.enqueueRenderTask({
      key: cacheKey,
      priority: params.priority,
      generation: gen,
      docId: params.docId,
      pageIndex: params.pageIndex,
      run: async () => {
        const bmp = await this.sendRpc<ImageBitmap | null>({
          type: 'renderPage',
          payload: {
            docId: params.docId,
            pageIndex: params.pageIndex,
            widthPx: w,
            heightPx: h,
            extraRotation: params.extraRotation,
            includeAnnotations: params.includeAnnotations ?? false,
            generation: params.priority === 'low' ? this.renderGeneration : gen,
          },
        });
        if (bmp) {
          this.bitmapCache.set(params.docId, params.pageIndex, cacheKey, bmp);
        }
        return bmp;
      },
    });
  }

  public async requestTileBitmap(
    params: Omit<RenderTilePayload, 'generation'> & { priority?: RenderPriority }
  ): Promise<ImageBitmap | null> {
    const cacheKey = `tile:${params.docId}:${params.pageIndex}:${Math.round(params.scaleX * 100)}:${Math.round(params.tileX)}:${Math.round(params.tileY)}:${params.tileWidthPx}x${params.tileHeightPx}`;

    const cached = this.bitmapCache.get(cacheKey);
    if (cached) return cached;

    const gen = this.renderGeneration;
    return await this.enqueueRenderTask({
      key: cacheKey,
      priority: params.priority ?? 'high',
      generation: gen,
      docId: params.docId,
      pageIndex: params.pageIndex,
      run: async () => {
        const bmp = await this.sendRpc<ImageBitmap | null>({
          type: 'renderTile',
          payload: {
            ...params,
            generation: gen,
          },
        });
        if (bmp) {
          this.bitmapCache.set(params.docId, params.pageIndex, cacheKey, bmp);
        }
        return bmp;
      },
    });
  }

  private enqueueRenderTask(
    spec: Omit<ScheduledRenderTask, 'resolvers'>
  ): Promise<ImageBitmap | null> {
    const existing = this.inFlightByKey.get(spec.key);
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.resolvers.push({ resolve, reject });
      });
    }

    return new Promise((resolve, reject) => {
      const task: ScheduledRenderTask = {
        ...spec,
        resolvers: [{ resolve, reject }],
      };
      this.inFlightByKey.set(spec.key, task);
      this.queues[spec.priority].push(task);
      this.pumpRenderQueues();
    });
  }

  private pumpRenderQueues(): void {
    while (this.activeRenderTasks < this.maxConcurrentRenders) {
      const next =
        this.queues.high.shift() ??
        this.queues.medium.shift() ??
        this.queues.low.shift();
      if (!next) break;

      if (next.priority !== 'low' && next.generation < this.renderGeneration) {
        this.inFlightByKey.delete(next.key);
        next.resolvers.forEach((r) => r.resolve(null));
        continue;
      }

      this.activeRenderTasks += 1;
      void next
        .run()
        .then((bmp) => {
          next.resolvers.forEach((r) => r.resolve(bmp));
        })
        .catch((err: unknown) => {
          const e = err instanceof Error ? err : new Error(String(err));
          next.resolvers.forEach((r) => r.reject(e));
        })
        .finally(() => {
          this.inFlightByKey.delete(next.key);
          this.activeRenderTasks = Math.max(0, this.activeRenderTasks - 1);
          this.pumpRenderQueues();
        });
    }
  }

  public async getPageChars(docId: string, pageIndex: number): Promise<PageCharsResult> {
    const cacheKey = `${docId}:${pageIndex}`;
    const hit = this.pageCharsCache.get(cacheKey);
    if (hit) return hit;

    const result = await this.sendRpc<PageCharsResult>({
      type: 'extractPageChars',
      docId,
      pageIndex,
    });
    this.pageCharsCache.set(cacheKey, result);
    return result;
  }

  public async extractAllText(
    docId: string
  ): Promise<{ pageIndex: number; text: string }[]> {
    return await this.sendRpc<{ pageIndex: number; text: string }[]>({
      type: 'extractAllText',
      docId,
    });
  }

  public async analyzeTextBlocks(
    docId: string,
    pageIndex: number
  ): Promise<PdfEditableTextBlock[]> {
    return await this.sendRpc<PdfEditableTextBlock[]>({
      type: 'analyzeTextBlocks',
      docId,
      pageIndex,
    });
  }

  public async commitTextBlock(
    payload: CommitTextBlockPayload
  ): Promise<CommitMutationResult> {
    const res = await this.sendRpc<CommitMutationResult>({
      type: 'commitTextBlock',
      payload,
    });
    this.invalidatePage(payload.docId, payload.pageIndex);
    return res;
  }

  public async applyRedactions(
    payload: ApplyRedactionsPayload
  ): Promise<CommitMutationResult> {
    const res = await this.sendRpc<CommitMutationResult>({
      type: 'applyRedactions',
      payload,
    });
    this.invalidateDocument(payload.docId);
    return res;
  }

  public async searchDocument(payload: SearchDocumentPayload): Promise<SearchMatch[]> {
    return await this.sendRpc<SearchMatch[]>({
      type: 'searchDocument',
      payload,
    });
  }

  public async exportBytes(docId: string): Promise<Uint8Array> {
    return await this.sendRpc<Uint8Array>({
      type: 'exportBytes',
      docId,
    });
  }
}

export const sharedPdfEngine = new PdfEngineClient();
