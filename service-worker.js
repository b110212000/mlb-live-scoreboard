/* Push-only Service Worker.
   No fetch handler and no application caching: avoids the old iPhone stale-cache issue. */

self.addEventListener('install',event=>{
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.map(key=>caches.delete(key)));
    }catch(_){}
    await self.clients.claim();
  })());
});

self.addEventListener('push',event=>{
  let payload={};
  try{
    payload=event.data?.json?.()||{};
  }catch(_){
    payload={body:event.data?.text?.()||'收到新的 MLB 戰況通知'};
  }

  const title=payload.title||'MLB 戰況';
  const targetUrl=new URL(payload.url||'./',self.registration.scope).href;

  event.waitUntil(self.registration.showNotification(title,{
    body:payload.body||'',
    icon:new URL('./app-icon.svg',self.registration.scope).href,
    tag:payload.tag||undefined,
    data:{url:targetUrl,testId:payload.testId||null,stage:payload.stage||null}
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const targetUrl=event.notification.data?.url||self.registration.scope;

  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('focus' in client){
        try{
          await client.navigate(targetUrl);
        }catch(_){}
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});
