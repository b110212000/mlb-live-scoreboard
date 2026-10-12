import {useEffect,useState} from 'react';
import {useScoreboard,actions} from '../store.js';
import {teamById,teamLabel} from '../teams.js';
import {PUSH_API} from '../config.js';
import {TAIWAN_PLAYER_NAMES} from '../taiwanPlayers.js';
import {logo} from './SubscriptionShared.jsx';
import {headshot,positionName,levelName} from '../players.js';
import {t,lang,locale} from '../i18n.js';

const MLB_API='https://statsapi.mlb.com/api/v1';
const REFRESH_MS=10*60_000;
const LEVEL_SPORTS='1,11,12,13,14,16';
// 層級名稱依 sportId 在前端翻譯（Worker 回傳的 label 是中文）。
const levelLabel=level=>({1:'MLB',11:levelName('AAA'),12:levelName('AA'),13:levelName('A+'),14:levelName('A'),16:t('新人聯盟')})[level.sportId]||level.label;

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
  if(teamById(team.id))return teamLabel(team);
  const org=teamLabel(team.parentOrgId);
  return org?t('{org}體系 · {team}',{org,team:team.name}):team.name;
}

function hittingLine(s){
  if(!s?.gamesPlayed)return t('本季尚無出賽');
  return [t('{n} 場',{n:s.gamesPlayed}),t('打擊率 {avg}',{avg:s.avg??'-'}),t('{n} 轟',{n:s.homeRuns??0}),t('{n} 打點',{n:s.rbi??0}),s.ops?`OPS ${s.ops}`:''].filter(Boolean).join(' · ');
}

function pitchingLine(s){
  if(!s?.gamesPlayed)return t('本季尚無出賽');
  const record=s.saves?t('{w} 勝 {l} 敗 {sv} 救援',{w:s.wins??0,l:s.losses??0,sv:s.saves}):t('{w} 勝 {l} 敗',{w:s.wins??0,l:s.losses??0});
  return [t('{ip} 局',{ip:s.inningsPitched??'0.0'}),t('防禦率 {era}',{era:s.era??'-'}),record,t('{n} 三振',{n:s.strikeOuts??0})].join(' · ');
}

// 今天（裝置當地日期）的比賽狀態。
function todayText(game,teamId){
  const away=game.teams?.away,home=game.teams?.home;
  const isHome=Number(home?.team?.id)===Number(teamId);
  const opponentTeam=(isHome?away:home)?.team;
  const opponent=teamLabel(opponentTeam)||opponentTeam?.name||'';
  const state=game.status?.abstractGameState;
  const score=`${away?.score??0} : ${home?.score??0}`;
  const versus=`${isHome?'vs':'@'} ${opponent}`;
  if(state==='Final')return t('今日終場 {score} {versus}',{score,versus});
  if(state==='Live')return t('比賽進行中 {score} {versus}',{score,versus});
  const time=new Intl.DateTimeFormat(locale(),{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(game.gameDate));
  return t('今天 {time} {versus}',{time,versus});
}

function PlayerCard({player,game}){
  // 中文與日文介面顯示中文（漢字）姓名，英文介面只顯示英文名。
  const zh=lang()==='en'?null:TAIWAN_PLAYER_NAMES[player.id];
  const position=positionName(player.position)||player.position;
  const parent=player.currentTeam&&(teamById(player.currentTeam.id)?.id||player.currentTeam.parentOrgId);
  // 整張卡片可點開球員資料；名字是按鈕，鍵盤也能操作（點擊會冒泡到卡片，只開一次）。
  return <article className="tw-card" data-player-id={player.id} onClick={()=>actions.openPlayer(player.id)}>
    <img className="tw-photo" src={headshot(player.id,180)} alt="" loading="lazy"/>
    <div className="tw-body">
      <div className="tw-name"><button type="button" className="tw-open" aria-label={t('{name} 球員資料',{name:zh||player.fullName})}><b>{zh||player.fullName}</b></button>{zh&&<small>{player.fullName}</small>}<span className="tw-more" aria-hidden="true">›</span></div>
      <div className="tw-team">
        {parent&&<span className="subs-logo small" aria-hidden="true"><img src={logo(parent)} alt=""/></span>}
        <span>{[position,teamText(player)].filter(Boolean).join(' · ')}</span>
      </div>
      {game&&<div className={'tw-today'+(game.status?.abstractGameState==='Live'?' live':'')}>{todayText(game,player.currentTeam?.id)}</div>}
      <ul className="tw-stats">{player.levels.map(level=><li key={level.sportId}>
        <span className="tw-level">{levelLabel(level)}</span>
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
        if(!cancelled)setError(err.message);
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

  return <section className="card subs-shell tw-shell" aria-label={t('台灣旅外球員')}>
    <p className="subs-intro">{data?t('{season} 球季在 MLB 與小聯盟出賽的台灣球員，共 {n} 人（大聯盟 {mlb} 人）。',{season:data.season||'',n:players.length,mlb:mlbCount}):t('MLB 與小聯盟的台灣球員。')}{t('依最高出賽層級分組，成績為各層級本季成績；資料來自 MLB 官方球員名單（出生地為台灣）。')}</p>
    {error&&<div className="subs-banner">{t('旅外球員資料讀取失敗：{error}',{error})}</div>}
    {!data&&!error&&<p className="subs-empty">{t('載入旅外球員中…')}</p>}
    {groups.map(group=><section key={group.level.sportId} className="subs-section tw-group" aria-label={levelLabel(group.level)}>
      <div className="subs-section-head"><h3>{group.level.sportId===1?t('大聯盟'):levelLabel(group.level)}</h3><span>{t('{n} 人',{n:group.players.length})}</span></div>
      <div className="tw-list">{group.players.map(player=><PlayerCard key={player.id} player={player} game={games[player.currentTeam?.id]}/>)}</div>
    </section>)}
  </section>;
}
