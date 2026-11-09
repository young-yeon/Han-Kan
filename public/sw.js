// Private pages and API responses are deliberately never cached.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>한칸</title><body style="font:18px system-ui;padding:40px;background:#f7f7f0;color:#254d3b"><h1>잠시 오프라인이에요</h1><p>냉장고 정보와 AI 추천은 인터넷 연결이 필요해요.</p><button onclick="location.reload()">다시 연결</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}}))));});
