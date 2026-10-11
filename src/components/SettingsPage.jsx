import {useState} from 'react';
import {THEMES,themePref,setThemePref} from '../theme.js';

const THEME_NOTE={
  dark:'深色背景，晚上看比賽比較不刺眼。',
  light:'淺色背景，白天或戶外比較清楚。',
  system:'依手機或電腦的深色 / 淺色設定自動切換。'
};

export function SettingsPage(){
  const [pref,setPref]=useState(themePref);
  const pick=value=>{setThemePref(value);setPref(value)};
  return <section className="card subs-shell theme-shell" aria-label="外觀">
    <div className="subs-section-head"><h3 id="themeTitle">外觀</h3></div>
    <div className="theme-options" role="radiogroup" aria-labelledby="themeTitle">
      {THEMES.map(([value,label])=><button key={value} type="button" role="radio" aria-checked={pref===value} data-theme-option={value} onClick={()=>pick(value)}>
        <span className={'theme-swatch theme-swatch-'+value} aria-hidden="true"/>
        <b>{label}</b>
      </button>)}
    </div>
    <p className="subs-intro">{THEME_NOTE[pref]}設定只存在這台裝置。</p>
  </section>;
}
