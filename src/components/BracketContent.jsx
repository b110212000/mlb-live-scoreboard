import {memo} from 'react';
export const BracketContent=memo(function BracketContent(){return <>

<section className="card bracket-shell">
<div className="bracket-header">
<div>
<div id="bracketYearText" className="bracket-eyebrow">{"POSTSEASON"}</div>
<h2>{"季後賽戰況"}</h2>
</div>
<div id="bracketStatus" className="bracket-status">{"準備載入"}</div>
</div>
<div id="bracketBoard" className="bracket-empty">{"載入季後賽戰況中…"}</div>
</section>

</>});
