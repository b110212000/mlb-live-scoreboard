import {useState} from 'react';
import {useScoreboard,actions} from '../store.js';
import {MLB_TEAMS} from '../teams.js';
import {SUPPORT_NOTICE,logo,SubsStatus} from './SubscriptionShared.jsx';

const LEAGUES=[['AL','美國聯盟'],['NL','國家聯盟']];
const DIVISIONS=[['E','東區'],['C','中區'],['W','西區']];
const LEAGUE_KEY='mlb-team-follow-league';
// 記住上次選的聯盟（只是瀏覽便利；讀不到時預設美國聯盟）。
function savedLeague(){
  try{return localStorage.getItem(LEAGUE_KEY)==='NL'?'NL':'AL'}catch(_){return 'AL'}
}

export function TeamFollow(){
  const {subs}=useScoreboard();
  const [league,setLeague]=useState(savedLeague);
  const blocked=Boolean(SUPPORT_NOTICE[subs.support]);
  const followed=new Set(subs.teams);
  const busy=id=>Boolean(subs.busy?.['team:'+id]);
  const gameCount=id=>subs.games.filter(game=>game.teamIds?.includes(id)).length;
  const followedIn=key=>MLB_TEAMS.filter(team=>team.league===key&&followed.has(team.id)).length;
  const pick=key=>{
    setLeague(key);
    try{localStorage.setItem(LEAGUE_KEY,key)}catch(_){}
  };
  const toggle=team=>followed.has(team.id)?actions.subs.unfollowTeam(team.id):actions.subs.followTeam(team.id);

  return <section className="card subs-shell" aria-label="追蹤球隊">
    <p className="subs-intro">點一下球隊卡片追蹤，再點一下取消。追蹤後會自動訂閱該隊接下來的季後賽，通知依「訂閱管理」的提醒項目發送。</p>
    <SubsStatus subs={subs}/>

    <div className="league-switch" role="radiogroup" aria-label="選擇聯盟" data-active={league}>
      <span className="league-switch-thumb" aria-hidden="true"/>
      {LEAGUES.map(([key,label])=>{
        const count=followedIn(key);
        return <button key={key} type="button" role="radio" aria-checked={league===key} data-league={key} onClick={()=>pick(key)}>
          <span>{label}</span>
          {count>0&&<span className="league-count" aria-label={`已追蹤 ${count} 隊`}>{count}</span>}
        </button>;
      })}
    </div>

    {/* 東區、中區、西區三欄並排，每區的球隊由上往下排（subgrid 讓三欄同一列對齊）。 */}
    <div className="divisions">
      {DIVISIONS.map(([division,label])=><section key={division} className="division" aria-labelledby={'division'+division}>
        <h3 id={'division'+division}>{label}</h3>
        {MLB_TEAMS.filter(team=>team.league===league&&team.division===division).map(team=>{
          const on=followed.has(team.id),count=gameCount(team.id);
          return <button key={team.id} type="button" className="team-card" data-team-id={team.id} aria-pressed={on} aria-label={`追蹤${team.name}（${team.en}）`}
            disabled={busy(team.id)||(!on&&blocked)} onClick={()=>toggle(team)}>
            <span className="team-card-badge" aria-hidden="true">{busy(team.id)?'…':on?'✓':'＋'}</span>
            <span className="subs-logo team-card-logo" aria-hidden="true"><img src={logo(team.id)} alt=""/></span>
            <span className="team-card-names">
              <b className="team-card-zh">{team.name}</b>
              <small className="team-card-en">{team.en}</small>
              {on&&<span className="team-card-state">{count?`自動訂閱 ${count} 場`:'已追蹤'}</span>}
            </span>
          </button>;
        })}
      </section>)}
    </div>
  </section>;
}
