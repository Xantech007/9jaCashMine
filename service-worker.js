// Flutterwave MineApp Service Worker — For Push Notifications
const CACHE_NAME = 'FlutterW-v1';
const urlsToCache = [
  'index.php',
  'start.php',
  'dashboard.php',
  '9jaCash.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response) { return response; }
      return fetch(event.request);
    })
  );
});

// Handle push notifications
self.addEventListener('push', function(event) {
  const data = event.data.json();
  const options = {
    body: data.body || 'You have a new notification from Flutterwave MineApp!',
    icon: '9jaCash.png',
    badge: '9jaCash.png',
    tag: data.tag || 'FlutterW-general',
    requireInteraction: true,
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Flutterwave MineApp', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow('dashboard.php')
    );
  }
});
