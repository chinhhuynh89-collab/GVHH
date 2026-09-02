const CACHE_NAME = 'tro-ly-hoa-hoc-v48';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/data/elements.js',
  './js/data/chapters-6.js',
  './js/data/chapters-7.js',
  './js/data/chapters-8.js',
  './js/data/chapters-9.js',
  './js/data/chapters-10.js',
  './js/data/chapters-11.js',
  './js/data/chapters-12.js',
  './js/data/curriculum.js',
  './js/features/periodic-table.js',
  './js/features/calculator.js',
  './js/features/balancer.js',
  './js/features/formula-parser.js',
  './js/features/progress.js',
  './js/features/chapter-overview.js',
  './js/features/chapter-detail.js',
  './js/features/custom-lessons.js',
  './js/features/custom-quiz.js',
  './js/features/custom-flashcards.js',
  './js/features/chapter-meta.js',
  './js/features/quiz-template.js',
  './js/features/quiz-excel.js',
  './js/features/doc-import.js',
  './js/features/device-id.js',
  './js/features/role.js',
  './js/features/firebase-init.js',
  './js/features/auth.js',
  './js/features/teacher-profile.js',
  './js/features/join-group.js',
  './js/features/groups-data.js',
  './js/features/programs-data.js',
  './js/features/group-manager.js',
  './js/features/exam-creator.js',
  './js/features/exam-taker.js',
  './js/features/exam-stats.js',
  './js/features/teacher-exam-monitor.js',
  './js/features/branding.js',
  './js/features/manage-students.js',
  './js/vendor/pdfjs/pdf.min.js',
  './js/vendor/pdfjs/pdf.worker.min.js',
  './js/vendor/firebase/firebase-app-compat.js',
  './js/vendor/firebase/firebase-auth-compat.js',
  './js/vendor/firebase/firebase-firestore-compat.js',
  './pages/bang-tuan-hoan.html',
  './pages/cong-cu-tinh-toan.html',
  './pages/can-bang-phuong-trinh.html',
  './pages/hoc-theo-chuong.html',
  './pages/chuong.html',
  './pages/ket-noi-dong-bo.html',
  './pages/ho-so.html',
  './pages/nhom-hoc-sinh.html',
  './pages/quan-ly-hoc-sinh.html',
  './pages/vao-nhom.html',
  './pages/tao-de-kiem-tra.html',
  './pages/kiem-tra.html',
  './pages/thong-ke.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
