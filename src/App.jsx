import {useEffect,useRef,useState} from 'react';
import {store,useScoreboard,actions} from './store.js';
import {createEngine} from 'scoreboard:engine';
import {Sidebar} from './components/Sidebar.jsx';
import {LiveDetails} from './components/LiveDetails.jsx';
import {BracketContent} from './components/BracketContent.jsx';
import {RosterContent} from './components/RosterContent.jsx';
import {InstallContent} from './components/InstallContent.jsx';
import {NotificationContent} from './components/NotificationContent.jsx';
import {UpdateControls} from './components/UpdateControls.jsx';
const titles={live:'MLB 季後賽即時戰況',bracket:'MLB 季後賽戰況',roster:'MLB 對戰名單',install:'安裝 / 分享 MLB 戰況',notifications:'MLB 訂閱通知',settings:'設定'};
export function App(){
  const {view}=useScoreboard(),[menuOpen,setMenuOpen]=useState(false);
  useEffect(()=>{
    const engine=createEngine({publish:patch=>store.update(patch)});
    actions.connect(engine);
    return ()=>{actions.connect(null);engine.dispose()};
  },[]);
  return <>
    <Sidebar open={menuOpen} view={view} onClose={()=>setMenuOpen(false)} onNavigate={actions.navigate}/>
    <div id="pullRefresh" className="pull-refresh" aria-hidden="true"><span className="pull-refresh-icon">↓</span><span id="pullRefreshText">下拉重新整理</span></div>
    <main className="wrap">
      <div className="topbar"><div className="topbar-title"><div className="brand-group"><div className="feature-menu-wrap"><button id="featureMenuButton" className="feature-menu-button" type="button" aria-expanded={menuOpen} aria-controls="featureMenu" aria-label="功能列表" onClick={()=>setMenuOpen(true)}><i/><i/><i/></button></div><div><h1 id="appTitle">{titles[view]}</h1><div id="appSubtitle" className="subtitle"/></div></div><div id="liveTitleActions" hidden={view!=='live'}><UpdateControls/></div></div></div>
      <div id="liveView" className="app-view" hidden={view!=='live'}><LiveDetails/></div>
      <div id="bracketView" className="app-view" hidden={view!=='bracket'}><BracketContent/></div>
      <div id="rosterView" className="app-view" hidden={view!=='roster'}><RosterContent/></div>
      <div id="installView" className="app-view" hidden={view!=='install'}><InstallContent/></div>
      <div id="notificationView" className="app-view" hidden={view!=='notifications'}><NotificationContent/></div>
      <div id="settingsView" className="app-view" hidden={view!=='settings'}><section className="card settings-shell" aria-label="設定"><h2>設定</h2><p>開發中</p></section></div>
      <footer className="foot" aria-label="網站資訊"><span>資料來源：MLB Stats API · 每 5 秒更新</span><span className="app-version">v2.0.1</span><span className="legal-links" hidden><a href="./privacy.html">隱私政策</a> · <a href="./terms.html">使用條款</a></span></footer>
    </main>
  </>;
}
