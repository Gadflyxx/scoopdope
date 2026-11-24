/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const LESSON_CACHE = 'scoopdope-lessons-v1';
const MEDIA_CACHE = 'scoopdope-media-v1';
const STATIC_CACHE = 'scoopdope-static-v1';
const OFFLINE_DB = 'scoopdope-offline';
const OFFLINE_STORE = 'sync-queue';
const SYNC_TAG = 'sync-offline-notes';

interface QueuedAction {
  id?: number;
  type: 'note' | 'progress';
  url: string;
  method: string;
  body: string;
  headers?: Record<string, string>;
  createdAt: number;
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
        db.createObjectStore(OFFLINE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllQueuedActions(): Promise<QueuedAction[]> {
  return openOfflineDb().then(
    (db) =>
      new Promise<QueuedAction[]>((resolve, reject) => {
        const tx = db.transaction(OFFLINE_STORE, 'readonly');
        const store = tx.objectStore(OFFLINE_STORE);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as QueuedAction[]);
        request.onerror = () => reject(request.error);
      })
  );
}

function deleteQueuedAction(id: number): Promise<void> {
  return openOfflineDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(OFFLINE_STORE, 'readwrite');
        const store = tx.objectStore(OFFLINE_STORE);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
  );
}

function isLessonRequest(url: URL): boolean {
  return (
    url.pathname.startsWith('/api/lessons') ||
    url.pathname.startsWith('/lessons') ||
    url.pathname.startsWith('/api/courses')
  );
}

function isMediaMetadataRequest(url: URL): boolean {
  return (
    url.pathname.startsWith('/api/media') ||
    /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(url.pathname) ||
    url.pathname.startsWith('/_next/image')
  );
}

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function networkFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function replayQueuedActions(): Promise<{ synced: number; failed: number }> {
  const actions = await getAllQueuedActions();
  let synced = 0;
  let failed = 0;

  for (const action of actions) {
    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers: action.headers ?? { 'Content-Type': 'application/json' },
        body: action.body,
      });
      if (response.ok) {
        if (typeof action.id === 'number') {
          await deleteQueuedAction(action.id);
        }
        synced += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  return { synced, failed };
}

async function notifyClients(message: unknown): Promise<void> {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    client.postMessage(message);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(['/', '/offline']).catch(() => undefined)
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => ![LESSON_CACHE, MEDIA_CACHE, STATIC_CACHE].includes(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (isLessonRequest(url)) {
    event.respondWith(networkFirst(request, LESSON_CACHE));
    return;
  }

  if (isMediaMetadataRequest(url)) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, STATIC_CACHE).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        const offline = await cache.match('/offline');
        return offline ?? Response.error();
      })
    );
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(
      (async () => {
        try {
          const result = await replayQueuedActions();
          await notifyClients({
            type: 'SYNC_COMPLETE',
            tag: SYNC_TAG,
            synced: result.synced,
            failed: result.failed,
          });
        } catch (error) {
          await notifyClients({
            type: 'SYNC_ERROR',
            tag: SYNC_TAG,
            message: error instanceof Error ? error.message : 'Unknown sync error',
          });
        }
      })()
    );
  }
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'ScoopDope';
  const options = {
    body: data.body || 'New notification',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: {
      url: data.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data.url;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.navigate(url).then((c) => c.focus());
      }
      return self.clients.openWindow(url);
    })
  );
});