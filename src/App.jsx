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
import {SettingsPage,LanguagePage} from './components/SettingsPage.jsx';
import {FeedbackPage} from './components/FeedbackPage.jsx';
import {StatHelpDialog} from './components/StatHelp.jsx';
import {AppUpdatePage} from './components/AppUpdatePage.jsx';
import {checkAppUpdate,useAppUpdate} from './updates.js';
import {APP_VERSION} from './config.js';
import {Toast} from './components/Toast.jsx';
import {UpdateControls} from './components/UpdateControls.jsx';
import {t,lang as currentLang,locale} from './i18n.js';
import {teamLabel} from './teams.js';

// 頁面標題在畫面重畫時才翻譯（跟著目前語言）。
const pageTitle=view=>({live:t('MLB 即時戰況'),bracket:t('MLB 季後賽戰況'),standings:t('戰績排行'),taiwan:t('台灣旅外球員'),hof:t('名人堂'),player:t('球員資料'),teams:t('追蹤球隊'),roster:t('MLB 對戰名單'),install:t('安裝 / 分享 MLB 戰況'),notifications:t('訂閱管理'),notificationTest:t('訂閱測試'),settings:t('外觀'),language:t('語言 / Language'),feedback:t('意見回饋'),updates:t('版本更新')})[view];

export function App(){
  const update=useAppUpdate();
  const {view,lang}=useScoreboard(),[menuOpen,setMenuOpen]=useState(false);
  useEffect(()=>{
    // engine 也用同一套多國語系：t()、目前語言、Intl 語系與在地化的球隊簡稱。
    const engine=createEngine({checkAppUpdate,publish:patch=>store.update(patch),t,lang:currentLang,locale,teamName:team=>teamLabel(team)});
    actions.connect(engine);
    return ()=>{actions.connect(null);engine.dispose()};
  },[]);
  useEffect(()=>{document.title=t('MLB 即時戰況 Pro')},[lang]);
  // 固定元件（engine 直接寫入其中的元素）只在 lang 改變時重畫。
  return <>
    <Toast/>
    <StatHelpDialog/>
    <Sidebar updateAvailable={!!update.remote} open={menuOpen} view={view} onClose={()=>setMenuOpen(false)} onNavigate={actions.navigate}/>
    <div id="pullRefresh" className="pull-refresh" aria-hidden="true"><span className="pull-refresh-icon">↓</span><span id="pullRefreshText">{t('下拉重新整理')}</span></div>
    <main className="wrap">
      <div className="topbar"><div className="topbar-title"><div className="brand-group"><div className="feature-menu-wrap"><button id="featureMenuButton" className="feature-menu-button" type="button" aria-expanded={menuOpen} aria-controls="featureMenu" aria-label={t('功能列表')} onClick={()=>setMenuOpen(true)}><i/><i/><i/>{update.remote&&<span className="app-update-dot" aria-label={t('有新版本')}/>}</button></div><div><h1 id="appTitle">{pageTitle(view)}</h1><div id="appSubtitle" className="subtitle"/></div></div><div id="liveTitleActions" hidden={view!=='live'}><UpdateControls lang={lang}/></div></div></div>
      <div id="liveView" className="app-view" hidden={view!=='live'}><LiveDetails lang={lang}/></div>
      <div id="bracketView" className="app-view" hidden={view!=='bracket'}><BracketContent lang={lang}/></div>
      <div id="standingsView" className="app-view" hidden={view!=='standings'}><StandingsPage/></div>
      <div id="taiwanView" className="app-view" hidden={view!=='taiwan'}><TaiwanPlayers/></div>
      <div id="hofView" className="app-view" hidden={view!=='hof'}><HallOfFame/></div>
      <div id="playerView" className="app-view" hidden={view!=='player'}><PlayerPage/></div>
      <div id="teamsView" className="app-view" hidden={view!=='teams'}><TeamFollow/></div>
      <div id="rosterView" className="app-view" hidden={view!=='roster'}><RosterContent lang={lang}/></div>
      <div id="installView" className="app-view" hidden={view!=='install'}><InstallContent lang={lang}/></div>
      <div id="notificationView" className="app-view" hidden={view!=='notifications'}><SubscriptionManager/></div>
      <div id="notificationTestView" className="app-view" hidden={view!=='notificationTest'}><NotificationContent lang={lang}/></div>
      <div id="settingsView" className="app-view" hidden={view!=='settings'}><SettingsPage/></div>
      <div id="languageView" className="app-view" hidden={view!=='language'}><LanguagePage/></div>
      <div id="updatesView" className="app-view" hidden={view!=='updates'}><AppUpdatePage/></div>
      <div id="feedbackView" className="app-view" hidden={view!=='feedback'}><FeedbackPage/></div>
      <footer className="foot" aria-label={t('網站資訊')}><span>{t('資料來源：MLB Stats API · 每 5 秒更新')}</span><span className="app-version">v{APP_VERSION}</span><span className="legal-links" hidden><a href="./privacy.html">{t('隱私政策')}</a> · <a href="./terms.html">{t('使用條款')}</a></span></footer>
    </main>
  </>;
}
