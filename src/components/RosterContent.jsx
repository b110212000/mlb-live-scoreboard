import {memo} from 'react';
export const RosterContent=memo(function RosterContent(){return <>

<section className="card roster-shell">
<div className="roster-page-head">
<div>
<div className="roster-eyebrow">{"MATCHUP ROSTER"}</div>
<h2 id="rosterMatchupTitle">{"對戰名單"}</h2>
<div id="rosterMeta" className="roster-meta">{"選擇一場比賽後即可查看兩隊名單"}</div>
</div>
<button id="rosterBackBtn" className="roster-back" type="button">{"← 即時比賽"}</button>
</div>
<div id="rosterBoard" className="roster-empty">{"準備載入兩隊名單…"}</div>
</section>

</>});
