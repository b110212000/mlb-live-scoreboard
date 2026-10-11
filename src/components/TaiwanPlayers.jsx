import {useEffect,useState} from 'react';
import {useScoreboard,actions} from '../store.js';
import {teamById} from '../teams.js';
import {PUSH_API} from '../config.js';
import {TAIWAN_PLAYER_NAMES} from '../taiwanPlayers.js';
import {logo} from './SubscriptionShared.jsx';
import {headshot,POSITION_ZH} from '../players.js';

const MLB_API='https://statsapi.mlb.com/api/v1';
const REFRESH_MS=10*60_000;
const LEVEL_SPORTS='1,11,12,13,14,16';

async function getJSON(url){
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response.json();
}

function localDate(offsetDays=0){
  const date=new Date(Date.now()+offsetDays*86_400_000);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function teamText(player){
  const team=player.currentTeam;
  if(!team)return '';
  const mlb=teamById(team.id);
  if(mlb)return mlb.name;
  const org=teamById(team.parentOrgId)?.name;
  return org?`${org}體系 · ${team.name}`:team.name;
}

function hittingLine(s){
  if(!s?.gamesPlayed)return '本季尚無出賽';
  return [`${s.gamesPlayed} 場`,`打擊率 ${s.avg??'-'}`,`${s.homeRuns??0} 轟`,`${s.rbi??0} 打點`,s.ops?`OPS ${s.ops}`:''].filter(Boolean).join(' · ');
}

function pitchingLine(s){
  if(!s?.gamesPlayed)return '本季尚無出賽';
  return [`${s.inningsPitched??'0.0'} 局`,`防禦率 ${s.era??'-'}`,`${s.wins??0} 勝 ${s.losses??0} 敗${s.saves?` ${s.saves} 救援`:''}`,`${s.strikeOuts??0} 三振`].join(' · ');
}

// 今天（裝置當地日期）的比賽狀態。
function todayText(game,teamId){
  const away=game.teams?.away,home=game.teams?.home;
  const isHome=Number(home?.team?.id)===Number(teamId);
  const opponent=(isHome?away:home)?.team?.name||'';
  const state=game.status?.abstractGameState;
  const score=`${away?.score??0} : ${home?.score??0}`;
  if(state==='Final')return `今日終場 ${score} ${isHome?'vs':'@'} ${opponent}`;
  if(state==='Live')return `比賽進行中 ${score} ${isHome?'vs':'@'} ${opponent}`;
  const time=new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(game.gameDate));
  return `今天 ${time} ${isHome?'vs':'@'} ${opponent}`;
}

function PlayerCard({player,game}){
  const zh=TAIWAN_PLAYER_NAMES[player.id];
  const position=POSITION_ZH[player.position]||player.position;
  const parent=player.currentTeam&&(teamById(player.currentTeam.id)?.id||player.currentTeam.parentOrgId);
  // 整張卡片可點開球員資料；名字是按鈕，鍵盤也能操作（點擊會冒泡到卡片，只開一次）。
  return <article className="tw-card" data-player-id={player.id} onClick={()=>actions.openPlayer(player.id)}>
    <img className="tw-photo" src={headshot(player.id,180)} alt="" loading="lazy"/>
    <div className="tw-body">
      <div className="tw-name"><button type="button" className="tw-open" aria-label={`${zh||player.fullName} 球員資料`}><b>{zh||player.fullName}</b></button>{zh&&<small>{player.fullName}</small>}<span className="tw-more" aria-hidden="true">›</span></div>
      <div className="tw-team">
        {parent&&<span className="subs-logo small" aria-hidden="true"><img src={logo(parent)} alt=""/></span>}
        <span>{[position,teamText(player)].filter(Boolean).join(' · ')}</span>
      </div>
      {game&&<div className={'tw-today'+(game.status?.abstractGameState==='Live'?' live':'')}>{todayText(game,player.currentTeam?.id)}</div>}
      <ul className="tw-stats">{player.levels.map(level=><li key={level.sportId}>
        <span className="tw-level">{level.label}</span>
        <span>{player.pitcher?pitchingLine(level.pitching):hittingLine(level.hitting)}</span>
      </li>)}</ul>
    </div>
  </article>;
}

export function TaiwanPlayers(){
  const {view}=useScoreboard();
  const [data,setData]=useState(null);
  const [games,setGames]=useState({});
  const [error,setError]=useState('');

  useEffect(()=>{
    if(view!=='taiwan')return;
    let cancelled=false;
    const load=async()=>{
      try{
        // 開季前今年名單可能還是空的，改顯示上一季。
        let season=new Date().getFullYear();
        let next=await getJSON(`${PUSH_API}/api/taiwan-players?season=${season}`);
        if(!next.players?.length){season-=1;next=await getJSON(`${PUSH_API}/api/taiwan-players?season=${season}`);}
        if(cancelled)return;
        setData(next);setError('');
        // 今天（前後各多抓一天再依當地日期篩選）有沒有比賽。
        const teamIds=[...new Set((next.players||[]).map(p=>p.currentTeam?.id).filter(Boolean))];
        if(!teamIds.length)return;
        const schedule=await getJSON(`${MLB_API}/schedule?sportId=${LEVEL_SPORTS}&teamId=${teamIds.join(',')}&startDate=${localDate(-1)}&endDate=${localDate(1)}`);
        const today=localDate(0),byTeam={};
        for(const day of schedule.dates||[]){
          for(const game of day.games||[]){
            const date=new Date(game.gameDate);
            const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
            if(key!==today)continue;
            for(const side of ['away','home'])byTeam[game.teams?.[side]?.team?.id]=game;
          }
        }
        if(!cancelled)setGames(byTeam);
      }catch(err){
        if(!cancelled)setError('旅外球員資料讀取失敗：'+err.message);
      }
    };
    load();
    const timer=setInterval(load,REFRESH_MS);
    return ()=>{cancelled=true;clearInterval(timer)};
  },[view]);

  const players=data?.players||[];
  const groups=(data?.levels||[]).map((level,index)=>({
    level,
    players:players.filter(player=>player.topLevel===index)
  })).filter(group=>group.players.length);
  const mlbCount=groups.find(group=>group.level.sportId===1)?.players.length||0;

  return <section className="card subs-shell tw-shell" aria-label="台灣旅外球員">
    <p className="subs-intro">{data?`${data.season||''} 球季在 MLB 與小聯盟出賽的台灣球員，共 ${players.length} 人（大聯盟 ${mlbCount} 人）。`:'MLB 與小聯盟的台灣球員。'}依最高出賽層級分組，成績為各層級本季成績；資料來自 MLB 官方球員名單（出生地為台灣）。</p>
    {error&&<div className="subs-banner">{error}</div>}
    {!data&&!error&&<p className="subs-empty">載入旅外球員中…</p>}
    {groups.map(group=><section key={group.level.sportId} className="subs-section tw-group" aria-label={group.level.label}>
      <div className="subs-section-head"><h3>{group.level.label==='MLB'?'大聯盟':group.level.label}</h3><span>{group.players.length} 人</span></div>
      <div className="tw-list">{group.players.map(player=><PlayerCard key={player.id} player={player} game={games[player.currentTeam?.id]}/>)}</div>
    </section>)}
  </section>;
}
