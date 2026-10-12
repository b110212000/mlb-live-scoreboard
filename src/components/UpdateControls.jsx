import {memo} from 'react';
import {t} from '../i18n.js';
export const UpdateControls=memo(function UpdateControls(){return <div className="title-live-actions" aria-label={t('即時比賽更新狀態')}>
<div id="liveChip" className="live-chip title-status-dot" tabIndex="0" data-tooltip={t('尚未更新')}>
<span id="liveDot" className="dot off"></span>
<span id="updateText" className="visually-hidden">{t('尚未更新')}</span>
</div>
<button id="refreshBtn" className="title-refresh-button" type="button" aria-label={t('立即更新')} title={t('立即更新')}>
<span aria-hidden="true">{"↻"}</span>
</button>
</div>;});
