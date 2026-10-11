import {useState} from 'react';
import {useScoreboard,actions} from '../store.js';
import {MLB_TEAMS} from '../teams.js';
import {SUPPORT_NOTICE,logo,teamName,SubsStatus,ConfirmDialog,unfollowRequest} from './SubscriptionShared.jsx';

const LEAGUES=[['AL','美國聯盟'],['NL','國家聯盟']];

export function TeamFollow(){
  const {subs}=useScoreboard();
  const [confirm,setConfirm]=useState(null);
  const blocked=Boolean(SUPPORT_NOTICE[subs.support]);
  const followed=new Set(subs.teams);
  const busy=id=>Boolean(subs.busy?.['team:'+id]);
  const gameCount=id=>subs.games.filter(game=>game.teamIds?.includes(id)).length;
  const askUnfollow=id=>setConfirm({...unfollowRequest(id),onConfirm:()=>actions.subs.unfollowTeam(id)});
  const toggle=id=>followed.has(id)?askUnfollow(id):actions.subs.followTeam(id);

  return <section className="card subs-shell" aria-label="追蹤球隊">
    <p className="subs-intro">追蹤後會自動訂閱該隊接下來的季後賽，通知依「訂閱管理」的提醒項目發送。點球隊即可追蹤或取消。</p>
    <SubsStatus subs={subs}/>

    <section className="subs-section" aria-labelledby="followedTitle">
      <div className="subs-section-head"><h3 id="followedTitle">已追蹤</h3><span>{subs.teams.length?`共 ${subs.teams.length} 隊`:''}</span></div>
      {subs.teams.length?<ul className="followed-list">
        {subs.teams.map(id=>{
          const count=gameCount(id);
          return <li key={id} className="followed-team" data-team-id={id}>
            <span className="subs-logo" aria-hidden="true"><img src={logo(id)} alt=""/></span>
            <span className="followed-text"><b>{teamName(id)}</b><small>{count?`已自動訂閱 ${count} 場比賽`:'目前沒有即將進行的季後賽，有新賽程會自動訂閱'}</small></span>
            <button type="button" className="subs-btn danger" disabled={busy(id)} onClick={()=>askUnfollow(id)}>取消追蹤</button>
          </li>;
        })}
      </ul>:<p className="subs-empty">{subs.status==='loading'||subs.status==='idle'?'載入中…':'還沒有追蹤球隊，從下方選擇喜歡的球隊。'}</p>}
    </section>

    {LEAGUES.map(([league,label])=><section key={league} className="subs-section" aria-labelledby={'teamLeague'+league}>
      <div className="subs-section-head"><h3 id={'teamLeague'+league}>{label}</h3></div>
      <div className="team-grid">
        {MLB_TEAMS.filter(team=>team.league===league).map(team=>{
          const on=followed.has(team.id);
          return <button key={team.id} type="button" className="team-option" data-team-id={team.id} aria-pressed={on} disabled={busy(team.id)||(!on&&blocked)} onClick={()=>toggle(team.id)}>
            <span className="subs-logo" aria-hidden="true"><img src={logo(team.id)} alt=""/></span>
            <span className="team-option-name">{team.name}<small>{team.abbr}</small></span>
            <span className="team-option-state" aria-hidden="true">{busy(team.id)?'…':on?'✓':'＋'}</span>
          </button>;
        })}
      </div>
    </section>)}

    <ConfirmDialog id="teamConfirm" request={confirm} onClose={()=>setConfirm(null)}/>
  </section>;
}
