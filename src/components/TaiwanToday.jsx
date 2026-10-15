import {actions} from '../store.js';
import {teamLabel} from '../teams.js';
import {t} from '../i18n.js';
import {gameKind,gameStatusText,gameTime} from '../gameData.js';
import {playerToday,statNumber,inningsText} from '../taiwanToday.js';

function Performance({game,result,playerId}){
  const kind=gameKind(game);
  if(['preview','postponed','cancelled'].includes(kind))return null;
  if(result?.failed)return <span className="tw-daily-warning">{t('本場資料暫時無法取得')}</span>;
  if(!result)return <span>{t('載入本場表現中…')}</span>;
  const stats=playerToday(result.box,playerId);
  if(stats.absent)return <span>{t('本場名單未列此球員')}</span>;
  if(!stats.played)return <span>{kind==='final'?t('本場未出賽'):t('尚未出賽')}</span>;
  const b=stats.batting,p=stats.pitching;
  return <>
    {b&&<span>{t('{ab} 打數 · {h} 安打 · {rbi} 打點',{ab:statNumber(b.atBats),h:statNumber(b.hits),rbi:statNumber(b.rbi)})}{Number(b.homeRuns)>0?t(' · {hr} 全壘打',{hr:statNumber(b.homeRuns)}):''}</span>}
    {p&&<span>{t('投 {ip} 局 · {r} 失分 · {k} 三振',{ip:inningsText(p.inningsPitched),r:statNumber(p.runs),k:statNumber(p.strikeOuts)})}</span>}
    {!b&&!p&&<span>{t('已出賽，尚無打擊或投球紀錄')}</span>}
  </>;
}
export function TaiwanToday({player,daily}){
  const games=daily?.byTeam?.[player.currentTeam?.id]||[];
  return <div className="tw-daily"><strong className="tw-daily-title">{t('今日表現')}</strong>
    {!daily?<span>{t('載入今日賽程中…')}</span>:daily.failed?<span className="tw-daily-warning">{t('今日賽程暫時無法取得')}</span>:!games.length?<span>{t('今日沒有比賽')}</span>:games.map(game=>{
      const isHome=Number(game.teams?.home?.team?.id)===Number(player.currentTeam?.id),opponent=game.teams?.[isHome?'away':'home']?.team;
      const kind=gameKind(game),score=`${game.teams?.away?.score??'—'} : ${game.teams?.home?.score??'—'}`;
      return <button className="tw-daily-game" type="button" key={game.gamePk} data-tw-game={game.gamePk} onClick={event=>{event.stopPropagation();actions.subs.openGame(game.gamePk)}}>
        <span className={'tw-today'+(kind==='live'?' live':'')}>{gameTime(game)} · {gameStatusText(game)}{game.gameNumber>1?t(' · 第 {n} 場',{n:game.gameNumber}):''}</span>
        <span className="tw-daily-match">{isHome?'vs':'@'} {teamLabel(opponent)||opponent?.name||t('球隊')}{['live','final','suspended','delayed'].includes(kind)?' · '+score:''}</span>
        <Performance game={game} result={daily.boxes?.[game.gamePk]} playerId={player.id}/>
      </button>;
    })}
  </div>;
}
