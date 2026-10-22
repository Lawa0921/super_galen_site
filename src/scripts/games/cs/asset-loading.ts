// Own resolved resources until the complete batch transfers to the caller.
// A failed/cancelled batch must also reclaim requests that finish afterwards.
export function loadOwnedResources<T>(requests: readonly Promise<T>[], release: (value: T) => void, signal: AbortSignal): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const count = requests.length;
    let state: 'pending' | 'cancelled' | 'transferred' = 'pending';
    const collected = new Map<number, T>();
    const fail = (error: unknown) => {
      if (state !== 'pending') return;
      state = 'cancelled'; signal.removeEventListener('abort', abort);
      for (const resource of collected.values()) release(resource);
      collected.clear(); reject(error);
    };
    const abort = () => fail(signal.reason ?? new DOMException('Asset loading cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    const tracked = requests.map((request, index) => request.then(resource => {
      if (state === 'pending') collected.set(index, resource);
      else if (state === 'cancelled') release(resource);
      // Promise.all must retain only void results. A permanently pending image
      // request must not keep disposed GLTF/texture CPU data in its result array.
    }));
    // Nested reactions also retain this executor's closure. Drop its reference
    // to the original fulfilled promises, whose values include the resources.
    requests = [];
    Promise.all(tracked).then(() => {
      if (state !== 'pending') return;
      state = 'transferred'; signal.removeEventListener('abort', abort);
      const resources = Array.from({ length: count }, (_, index) => collected.get(index)!);
      collected.clear(); resolve(resources);
    }, fail);
    if (signal.aborted) abort();
  });
}

// Cancel the whole owned batch only when the whole batch stops making progress.
// A per-file deadline would also cancel healthy requests waiting for a network
// slot. Nested image completion counts even when GLTF's outer body is finished.
export function createAssetLoadWatchdog(controller: AbortController) {
  let active = !controller.signal.aborted;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const loaded = new Map<string, number>();
  const stop = () => {
    active = false; clearTimeout(timer); loaded.clear();
    controller.signal.removeEventListener('abort', stop);
  };
  const completed = () => {
    if (!active) return;
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new DOMException('Asset loading stalled', 'TimeoutError')), 30000);
  };
  if (active) controller.signal.addEventListener('abort', stop, { once: true });
  completed();
  return {
    progress(id: string, bytes: number) {
      if (!active || !Number.isFinite(bytes) || bytes <= (loaded.get(id) ?? 0)) return;
      loaded.set(id, bytes); completed();
    },
    completed,
    stop,
  };
}
