import {cachedJSON,MLB_API} from './gameData.js';
import {teamById} from './teams.js';
export const currentSeason=()=>new Date().getFullYear();
export const statNumber=value=>value==null||String(value).trim()===''||value==='-.--'?null:(Number.isFinite(Number(value))?Number(value):null);
export const isPitcher=p=>p.position?.type==='Pitcher'||p.position?.abbreviation==='P';
export const isTwoWay=p=>p.position?.abbreviation==='TWP'||p.position?.type==='Two-Way Player';
const mlb=split=>split.sport?.id===1||split.sport?.abbreviation==='MLB';
// Prefer official combined totals for traded players; never average rate stats or take a random team split.
export function seasonStat(stats,group,year=currentSeason()){
  const splits=(stats||[]).filter(s=>s.group?.displayName===group&&s.type?.displayName==='season').flatMap(s=>s.splits||[])
    .filter(s=>mlb(s)&&String(s.season)===String(year)&&(!s.gameType||s.gameType==='R'));
  return (splits.find(s=>!s.team)|| (splits.length===1?splits[0]:null))?.stat||null;
}
export function comparePlayers(kind,a,b){
  const value=p=>kind==='hitting'?statNumber(p.hitting?.ops):(statNumber(p.pitching?.inningsPitched)>0?statNumber(p.pitching?.era):null);
  const x=value(a),y=value(b);
  return x==null&&y==null?a.name.localeCompare(b.name):x==null?1:y==null?-1:(kind==='hitting'?y-x:x-y)||a.name.localeCompare(b.name);
}
export async function loadTeam(teamId,year=currentSeason(),refresh=false){
  if(!teamById(teamId))throw new Error('team');
  const url=`${MLB_API}/teams/${teamId}/roster?rosterType=40Man&hydrate=person(stats(type=[season],group=[hitting,pitching],season=${year},sportIds=[1]))`;
  const data=await cachedJSON(url,refresh?0:300000);
  if(!Array.isArray(data.roster))throw new Error('roster');
  const players=[...new Map(data.roster.filter(e=>e.person?.id).map(e=>{
    const p=e.person;
    return [p.id,{id:p.id,name:p.fullName,position:e.position||p.primaryPosition||{},team:teamById(teamId),hitting:seasonStat(p.stats,'hitting',year),pitching:seasonStat(p.stats,'pitching',year)}];
  })).values()];
  return {players,season:year};
}
export function leaderboardRows(splits,kind,year){
  const byId=new Map();
  for(const s of splits){
    if(!s.player?.id||s.player.active===false||!mlb(s)||String(s.season)!==String(year)||s.gameType&&s.gameType!=='R')continue;
    const n=statNumber(s.stat?.[kind==='pitching'?'era':'ops']);
    if(n==null||n<0||!(Number(s.stat?.gamesPlayed)>0)||kind==='pitching'&&!(Number(s.stat?.inningsPitched)>0))continue;
    const row={id:s.player.id,name:s.player.fullName,position:s.position||s.player.primaryPosition||{},team:s.team,numTeams:s.numTeams||1,[kind]:s.stat};
    // MLB's season endpoint returns the official aggregate; retain it if duplicates occur.
    const old=byId.get(row.id);
    if(!old||row.numTeams>old.numTeams||!row.team&&old.team)byId.set(row.id,row);
  }
  return [...byId.values()].sort((a,b)=>comparePlayers(kind,a,b));
}
export async function loadLeaders(kind,league='MLB',year=currentSeason(),refresh=false){
  if(!['pitching','hitting'].includes(kind)||!['AL','NL','MLB'].includes(league))throw new Error('leaderboard');
  const params=new URLSearchParams({stats:'season',group:kind,season:String(year),sportIds:'1',gameType:'R',playerPool:'QUALIFIED',sortStat:kind==='pitching'?'era':'ops',order:kind==='pitching'?'asc':'desc',limit:'500',hydrate:'person'});
  if(league!=='MLB')params.set('leagueId',league==='AL'?'103':'104');
  const splits=[];
  for(let offset=0;;offset+=500){
    params.set('offset',String(offset));
    const data=await cachedJSON(`${MLB_API}/stats?${params}`,refresh?0:300000);
    const block=data.stats?.find(s=>s.group?.displayName===kind&&s.type?.displayName==='season');
    if(!block||!Array.isArray(block.splits))throw new Error('stats');
    splits.push(...block.splits);
    if(block.splits.length<500||splits.length>=Number(block.totalSplits))break;
    if(offset>=4500)throw new Error('stats limit');
  }
  return leaderboardRows(splits,kind,year);
}
