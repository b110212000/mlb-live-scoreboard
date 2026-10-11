import {useEffect,useRef,useState} from 'react';
import {store,useScoreboard,actions} from './store.js';
import {createEngine} from 'scoreboard:engine';
import {Sidebar} from './components/Sidebar.jsx';
import {LiveDetails} from './components/LiveDetails.jsx';
import {BracketContent} from './components/BracketContent.jsx';
import {RosterContent} from './components/RosterContent.jsx';
import {InstallContent} from './components/InstallContent.jsx';
import {NotificationContent} from './components/NotificationContent.jsx';
import {SubscriptionManager} from './components/SubscriptionManager.jsx';
import {TeamFollow} from './components/TeamFollow.jsx';
import {StandingsPage} from './components/StandingsPage.jsx';
import {TaiwanPlayers} from './components/TaiwanPlayers.jsx';
import {HallOfFame} from './components/HallOfFame.jsx';
import {PlayerPage} from './components/PlayerPage.jsx';
import {Toast} from './components/Toast.jsx';
import {UpdateControls} from './components/UpdateControls.jsx';
const titles={live:'MLB 即時戰況',bracket:'MLB 季後賽戰況',standings:'戰績排行',taiwan:'台灣旅外球員',hof:'名人堂',player:'球員資料',teams:'追蹤球隊',roster:'MLB 對戰名單',install:'安裝 / 分享 MLB 戰況',notifications:'訂閱管理',notificationTest:'訂閱測試',settings:'設定'};
export function App(){
  const {view}=useScoreboard(),[menuOpen,setMenuOpen]=useState(false);
  useEffect(()=>{
    const engine=createEngine({publish:patch=>store.update(patch)});
    actions.connect(engine);
    return ()=>{actions.connect(null);engine.dispose()};
  },[]);
  return <>
    <Toast/>
    <Sidebar open={menuOpen} view={view} onClose={()=>setMenuOpen(false)} onNavigate={actions.navigate}/>
    <div id="pullRefresh" className="pull-refresh" aria-hidden="true"><span className="pull-refresh-icon">↓</span><span id="pullRefreshText">下拉重新整理</span></div>
    <main className="wrap">
      <div className="topbar"><div className="topbar-title"><div className="brand-group"><div className="feature-menu-wrap"><button id="featureMenuButton" className="feature-menu-button" type="button" aria-expanded={menuOpen} aria-controls="featureMenu" aria-label="功能列表" onClick={()=>setMenuOpen(true)}><i/><i/><i/></button></div><div><h1 id="appTitle">{titles[view]}</h1><div id="appSubtitle" className="subtitle"/></div></div><div id="liveTitleActions" hidden={view!=='live'}><UpdateControls/></div></div></div>
      <div id="liveView" className="app-view" hidden={view!=='live'}><LiveDetails/></div>
      <div id="bracketView" className="app-view" hidden={view!=='bracket'}><BracketContent/></div>
      <div id="standingsView" className="app-view" hidden={view!=='standings'}><StandingsPage/></div>
      <div id="taiwanView" className="app-view" hidden={view!=='taiwan'}><TaiwanPlayers/></div>
      <div id="hofView" className="app-view" hidden={view!=='hof'}><HallOfFame/></div>
      <div id="playerView" className="app-view" hidden={view!=='player'}><PlayerPage/></div>
      <div id="teamsView" className="app-view" hidden={view!=='teams'}><TeamFollow/></div>
      <div id="rosterView" className="app-view" hidden={view!=='roster'}><RosterContent/></div>
      <div id="installView" className="app-view" hidden={view!=='install'}><InstallContent/></div>
      <div id="notificationView" className="app-view" hidden={view!=='notifications'}><SubscriptionManager/></div>
      <div id="notificationTestView" className="app-view" hidden={view!=='notificationTest'}><NotificationContent/></div>
      <div id="settingsView" className="app-view" hidden={view!=='settings'}><section className="card settings-shell" aria-label="設定"><h2>設定</h2><p>開發中</p></section></div>
      <footer className="foot" aria-label="網站資訊"><span>資料來源：MLB Stats API · 每 5 秒更新</span><span className="app-version">v2.5.2</span><span className="legal-links" hidden><a href="./privacy.html">隱私政策</a> · <a href="./terms.html">使用條款</a></span></footer>
    </main>
  </>;
}
