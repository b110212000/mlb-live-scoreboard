import {useState} from 'react';
import {THEMES,themePref,setThemePref} from '../theme.js';
import {LANGS,langPref,detectLang,t} from '../i18n.js';
import {actions,useScoreboard} from '../store.js';

// 標籤在畫面重畫時才翻譯（跟著目前語言）。
const themeLabel=key=>({dark:t('深色'),light:t('淺色'),system:t('跟隨系統')})[key];
const themeNote=key=>({
  dark:t('深色背景，晚上看比賽比較不刺眼。'),
  light:t('淺色背景，白天或戶外比較清楚。'),
  system:t('依手機或電腦的深色 / 淺色設定自動切換。')
})[key];

export function SettingsPage(){
  useScoreboard();
  const [pref,setPref]=useState(themePref);
  const pick=value=>{setThemePref(value);setPref(value)};
  return <section className="card subs-shell theme-shell" aria-label={t('外觀')}>
    <div className="subs-section-head"><h3 id="themeTitle">{t('外觀')}</h3></div>
    <div className="theme-options" role="radiogroup" aria-labelledby="themeTitle">
      {THEMES.map(([value])=><button key={value} type="button" role="radio" aria-checked={pref===value} data-theme-option={value} onClick={()=>pick(value)}>
        <span className={'theme-swatch theme-swatch-'+value} aria-hidden="true"/>
        <b>{themeLabel(value)}</b>
      </button>)}
    </div>
    <p className="subs-intro">{themeNote(pref)}{t('設定只存在這台裝置。')}</p>
  </section>;
}

// 語言名稱一律用該語言本身的寫法（繁體中文 / English / 日本語），找得到自己的語言。
const NATIVE_NAME={zh:'繁體中文',en:'English',ja:'日本語'};

export function LanguagePage(){
  useScoreboard();
  const [pref,setPref]=useState(langPref);
  const pick=value=>{setPref(value);actions.setLang(value)};
  return <section className="card subs-shell lang-shell" aria-label={t('語言 / Language')}>
    <div className="subs-section-head"><h3 id="langTitle">{t('語言 / Language')}</h3></div>
    <div className="lang-options" role="radiogroup" aria-labelledby="langTitle">
      {LANGS.map(([value])=><button key={value} type="button" role="radio" aria-checked={pref===value} data-lang-option={value} onClick={()=>pick(value)}>
        <b>{value==='auto'?t('跟隨裝置'):NATIVE_NAME[value]}</b>
        {value==='auto'&&<small>{t('目前是 {lang}',{lang:NATIVE_NAME[detectLang()]})}</small>}
      </button>)}
    </div>
    <p className="subs-intro">{t('比賽資料中的球員名字與 MLB 原文說明維持英文。推播通知也會改用這個語言。設定只存在這台裝置。')}</p>
  </section>;
}
