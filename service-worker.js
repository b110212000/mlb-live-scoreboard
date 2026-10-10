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
  const target=new URL(payload.url||'./',self.registration.scope);
  const gamePk=Number(payload.gamePk);
  if(Number.isSafeInteger(gamePk)&&gamePk>0){
    target.searchParams.set('view','live');
    target.searchParams.set('gamePk',String(gamePk));
  }
  const targetUrl=target.href;

  event.waitUntil(self.registration.showNotification(title,{
    body:payload.body||'',
    icon:new URL('./assets/app-icon-192.png?v=2.0.2',self.registration.scope).href,
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
      // 同一 GitHub Pages 網域可能有其他專案，只重用本 App 的視窗。
      if(!client.url?.startsWith(self.registration.scope))continue;
      if('focus' in client){
        try{
          const navigated=await client.navigate(targetUrl);
          if(navigated)return navigated.focus();
        }catch(_){}
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});
