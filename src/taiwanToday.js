import {MLB_API,cachedJSON,gamesOnDate,shiftDate,gameKind} from './gameData.js';

export async function loadTaiwanSchedule(players,date,force=false){
  const ids=[...new Set(players.map(p=>Number(p.currentTeam?.id)).filter(id=>Number.isSafeInteger(id)&&id>0))];
  if(!ids.length)return {games:[],byTeam:{}};
  const data=await cachedJSON(`${MLB_API}/schedule?sportId=1,11,12,13,14,16&teamId=${ids.join(',')}&startDate=${shiftDate(date,-1)}&endDate=${shiftDate(date,1)}&hydrate=linescore`,force?0:15000);
  const games=gamesOnDate(data,date),byTeam={};
  for(const game of games){for(const side of ['away','home']){const id=game.teams?.[side]?.team?.id;if(id)(byTeam[id]||=[]).push(game)}}
  return {games,byTeam};
}
export async function loadTodayBoxes(games,cancelled=()=>false,force=false){
  const wanted=[...new Map(games.filter(game=>!['preview','postponed','cancelled'].includes(gameKind(game))).map(g=>[g.gamePk,g])).values()];
  const results={};let index=0;
  await Promise.all(Array.from({length:Math.min(3,wanted.length)},async()=>{
    while(index<wanted.length&&!cancelled()){
      const game=wanted[index++];
      try{
        const box=await cachedJSON(`${MLB_API}/game/${game.gamePk}/boxscore`,force?0:gameKind(game)==='final'?300000:15000);
        if(!box?.teams?.away?.players||!box?.teams?.home?.players)throw new Error('boxscore');
        results[game.gamePk]={box,failed:false};
      }catch{results[game.gamePk]={box:null,failed:true}}
    }
  }));
  return results;
}
const positive=value=>Number(value)>0;
export function playerToday(box,id){
  const player=box?.teams?.away?.players?.['ID'+id]||box?.teams?.home?.players?.['ID'+id];
  if(!player)return {absent:true};
  const batting=player.stats?.batting||{},pitching=player.stats?.pitching||{},fielding=player.stats?.fielding||{};
  const hit=['gamesPlayed','plateAppearances','atBats','runs','stolenBases'].some(key=>positive(batting[key]));
  const pitch=['gamesPlayed','gamesPitched','battersFaced','numberOfPitches','pitchesThrown','outs','inningsPitched'].some(key=>positive(pitching[key]));
  const field=['gamesPlayed','gamesStarted','assists','putOuts','errors'].some(key=>positive(fielding[key]));
  return {absent:false,played:hit||pitch||field,batting:hit?batting:null,pitching:pitch?pitching:null};
}
export function statNumber(value){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0?Number(value):'—';}
export function inningsText(value){return typeof value==='string'&&/^\d+\.[012]$/.test(value)?value:Number.isSafeInteger(value)&&value>=0?String(value)+'.0':'—';}
