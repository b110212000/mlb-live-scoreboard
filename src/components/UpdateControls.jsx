import {memo} from 'react';
export const UpdateControls=memo(function UpdateControls(){return <div className="title-live-actions" aria-label="即時比賽更新狀態">
<div id="liveChip" className="live-chip title-status-dot" tabIndex="0" data-tooltip="尚未更新">
<span id="liveDot" className="dot off"></span>
<span id="updateText" className="visually-hidden">{"尚未更新"}</span>
</div>
<button id="refreshBtn" className="title-refresh-button" type="button" aria-label="立即更新" title="立即更新">
<span aria-hidden="true">{"↻"}</span>
</button>
</div>;});
