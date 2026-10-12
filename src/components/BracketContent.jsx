import {memo} from 'react';
import {t} from '../i18n.js';
export const BracketContent=memo(function BracketContent(){return <>

<section className="card bracket-shell">
<div className="bracket-header">
<div>
<div id="bracketYearText" className="bracket-eyebrow">{"POSTSEASON"}</div>
<h2>{t('季後賽戰況')}</h2>
</div>
<div id="bracketStatus" className="bracket-status">{t('準備載入')}</div>
</div>
<div id="bracketBoard" className="bracket-empty">{t('載入季後賽戰況中…')}</div>
</section>

</>});
