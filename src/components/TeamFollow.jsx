import {useState} from 'react';
import {useScoreboard,actions} from '../store.js';
import {MLB_TEAMS} from '../teams.js';
import {SUPPORT_NOTICE,logo,SubsStatus} from './SubscriptionShared.jsx';
import {LeagueSwitch,LeaguePager,savedLeague,saveLeague} from './LeagueSwitch.jsx';

const DIVISIONS=[['E','東區'],['C','中區'],['W','西區']];
const LEAGUE_KEY='mlb-team-follow-league';

export function TeamFollow(){
  const {subs}=useScoreboard();
  const [league,setLeague]=useState(()=>savedLeague(LEAGUE_KEY));
  const blocked=Boolean(SUPPORT_NOTICE[subs.support]);
  const followed=new Set(subs.teams);
  const busy=id=>Boolean(subs.busy?.['team:'+id]);
  const gameCount=id=>subs.games.filter(game=>game.teamIds?.includes(id)).length;
  const counts={
    AL:MLB_TEAMS.filter(team=>team.league==='AL'&&followed.has(team.id)).length,
    NL:MLB_TEAMS.filter(team=>team.league==='NL'&&followed.has(team.id)).length
  };
  const pick=key=>{setLeague(key);saveLeague(LEAGUE_KEY,key)};
  const toggle=team=>followed.has(team.id)?actions.subs.unfollowTeam(team.id):actions.subs.followTeam(team.id);

  // 東區、中區、西區三欄並排，每區的球隊由上往下排（subgrid 讓三欄同一列對齊）。
  const panel=key=><div className="divisions">
    {DIVISIONS.map(([division,divisionLabel])=><section key={division} className="division" aria-labelledby={'division'+key+division}>
      <h3 id={'division'+key+division}>{divisionLabel}</h3>
      {MLB_TEAMS.filter(team=>team.league===key&&team.division===division).map(team=>{
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
  </div>;

  return <section className="card subs-shell" aria-label="追蹤球隊">
    <p className="subs-intro">點一下球隊卡片追蹤，再點一下取消；左右滑動可切換聯盟。追蹤後會自動訂閱該隊接下來的比賽（例行賽、季後賽），通知依「訂閱管理」的提醒項目發送。</p>
    <SubsStatus subs={subs}/>
    <LeagueSwitch league={league} onPick={pick} counts={counts}/>
    <LeaguePager league={league} onPick={pick} renderPanel={panel}/>
  </section>;
}
