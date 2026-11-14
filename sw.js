/* 효돈농원 PWA 서비스 워커.
 * 앱 셸(HTML·매니페스트·아이콘·상품 사진)은 설치 시 캐시하고,
 * 같은 출처 정적 자산(해시 JS/CSS·폰트·이미지)은 캐시 우선으로,
 * 내비게이션(HTML)은 네트워크 우선 + 오프라인 시 캐시 폴백으로 제공합니다.
 * Apps Script(/exec)나 구글 드라이브 등 다른 출처 요청은 절대 캐시하지 않습니다
 * (주문·관리자 데이터가 낡으면 안 됩니다). POST 등 GET이 아닌 요청도 캐시하지 않습니다.
 */

const CACHE_NAME = 'hyodon-farm-v1';

const PRECACHE_URLS = [
  './',
  'index.html',
  'admin.html',
  'track.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'favicon.svg',
  'assets/hero.jpg',
  'assets/golden.jpg',
  'assets/tangerine.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // 하나라도 실패하면 설치 전체가 실패하므로, 항목별로 실패를 무시합니다.
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // GET이 아닌 요청(주문 제출 등)은 네트워크 전용 — 캐시하지 않습니다.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // 다른 출처(Apps Script /exec, 드라이브 썸네일, CDN 등)는 네트워크 전용.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // 내비게이션: 네트워크 우선 — 새 배포의 HTML을 먼저 받습니다.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('index.html')),
        ),
    );
    return;
  }

  // 같은 출처 정적 자산: 캐시 우선, 없으면 네트워크에서 받아 캐시에 저장합니다.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
