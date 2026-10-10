import {memo} from 'react';
import {Highlights, Scoreboard, GameTabs, ErrorMessage} from './LiveCore.jsx';
export const LiveDetails=memo(function LiveDetails(){return <>

<div className="game-selector-row">
<div className="top-controls-row">
<div id="topControls" className="controls">
<label className="date-picker-control" aria-label="選擇比賽日期" title="選擇日期">
<span className="calendar-icon" aria-hidden="true">
<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
<path d="M7 2v3M17 2v3M4.5 8.5h15M5.5 4.5h13a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2Z"></path>
<path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01"></path>
</svg>
</span>
<input id="dateInput" type="date" aria-label="選擇比賽日期" />
</label>
</div>
<button id="topControlsToggle" className="collapse-toggle top-controls-toggle" type="button" aria-controls="topControls" aria-expanded="true" aria-label="收合日期與更新">
<span className="chev" aria-hidden="true">{"⌃"}</span>
</button>
</div>
<GameTabs />
</div>
<ErrorMessage />
<Highlights />
<Scoreboard />
<section className="card table-card" aria-label="逐局比分">
<div className="scroll">
<table>
<thead id="inningHead"></thead>
<tbody id="inningBody"></tbody>
</table>
</div>
</section>
<section id="noGameMessage" className="card no-game-message" hidden role="status" aria-live="polite">
<p id="noGameText">{"今日沒有比賽"}</p>
<span>{"請選擇其他日期查看賽事"}</span>
</section>
<div id="liveDetailTabs" className="live-detail-tabs" hidden role="tablist" aria-label="比賽詳細資訊">
<button type="button" className="live-detail-tab" data-live-tab="stats" role="tab" aria-selected="false">{"統計"}</button>
<button type="button" className="live-detail-tab active" data-live-tab="status" role="tab" aria-selected="true">{"賽況"}</button>
<button type="button" className="live-detail-tab" data-live-tab="series" role="tab" aria-selected="false">{"系列賽"}</button>
<button type="button" className="live-detail-tab" data-live-tab="recap" hidden role="tab" aria-selected="false" aria-controls="liveDetailRecap">{"賽後精華"}</button>
</div>
<div id="liveDetailViewport" className="live-detail-viewport" hidden>
<div id="liveDetailTrack" className="live-detail-track">
<div id="liveDetailStats" className="live-detail-panel" data-live-panel="stats">
<div className="card boxscore-content">
<div className="boxscore-subsection-title">{"隊伍數據"}</div>
<div id="teamStatsBoard" className="team-stats-empty">{"等待比賽資料"}</div>
<div className="boxscore-subsection-title player-stats-title">{"球員數據"}</div>
<div id="boxScoreBoard" className="boxscore-empty">{"等待比賽資料"}</div>
</div>
</div>
<div id="liveDetailStatus" className="live-detail-panel" data-live-panel="status">
<section className="card collapsible-card matchup-card" data-collapse-section>
<div className="section-head" data-collapse-head>
<h2>{"目前對決"}</h2>
<button className="collapse-toggle" type="button" aria-expanded="true" aria-label="收合目前對決"><span className="chev" aria-hidden="true">{"⌃"}</span></button>
</div>
<div className="collapse-body" data-collapse-body>
<div className="matchup-stage">
<div className="matchup-person batter-side">
<img id="batterPhoto" className="headshot" alt="" />
<div className="matchup-person-copy">
<div className="label">{"Batter / 打者"}</div>
<div id="batterName" className="person-name">{"--"}</div>
<div id="batterMeta" className="person-meta">{"等待比賽資料"}</div>
</div>
</div>
<div className="matchup-center">
<div className="compact-count" aria-label="球數">
<span id="balls">{"0"}</span><span className="count-dash">{"-"}</span><span id="strikes">{"0"}</span>
</div>
<div className="diamond-wrap" aria-label="壘包狀況">
<div className="diamond"></div>
<div id="base2" className="base b2"></div>
<div id="base1" className="base b1"></div>
<div id="base3" className="base b3"></div>
</div>
<div className="outs-dots" aria-label="出局數">
<span className="out-dot" data-out-dot="1"></span>
<span className="out-dot" data-out-dot="2"></span>
<span className="out-dot" data-out-dot="3"></span>
<span id="outs" className="outs-value" aria-hidden="true">{"0"}</span>
</div>
</div>
<div className="matchup-person pitcher-side">
<img id="pitcherPhoto" className="headshot" alt="" />
<div className="matchup-person-copy">
<div className="label">{"Pitcher / 投手"}</div>
<div id="pitcherName" className="person-name">{"--"}</div>
<div id="pitcherMeta" className="person-meta">{"總用球 -- · 本打席 -- 球"}</div>
</div>
</div>
</div>
<div id="baseSummary" className="base-summary runner-summary">
<div><span>{"一壘"}</span><strong>{"--"}</strong></div>
<div><span>{"二壘"}</span><strong>{"--"}</strong></div>
<div><span>{"三壘"}</span><strong>{"--"}</strong></div>
</div>
<div className="pitch-summary">
<div className="mini-card">
<div className="k">{"最近一球"}</div>
<div id="lastPitchMain" className="v">{"--"}</div>
<div id="lastPitchSub" className="s">{"等待投球資料"}</div>
</div>
<div className="mini-card">
<div className="k">{"投手效率"}</div>
<div id="pitchEfficiency" className="v">{"--"}</div>
<div id="pitchEfficiencySub" className="s">{"好球數 / 用球數"}</div>
</div>
</div>
<div className="pitch-visual">
<div className="pitch-grid">
<div className="zone-wrap" aria-label="最近一球進壘點">
<div id="strikeZone" className="zone"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
<div id="pitchDot" className="pitch-dot"></div>
</div>
<div id="pitchData" className="pitch-data">{"目前沒有可顯示的投球座標。"}</div>
</div>
</div>
<div id="latestPlay" className="latest">{"尚無最新打席資訊"}</div>
<div>
<div className="label" style={{"marginTop": "11px"}}>{"本打席投球序列"}</div>
<div id="pitchSequence" className="pitch-seq"></div>
</div>
</div>
</section>
<section className="card events collapsible-card" data-collapse-section>
<div className="section-head" data-collapse-head>
<h2 className="section-title">{"得分紀錄"}</h2>
<button className="collapse-toggle" type="button" aria-expanded="true" aria-label="收合得分紀錄"><span className="chev" aria-hidden="true">{"⌃"}</span></button>
</div>
<div className="collapse-body" data-collapse-body>
<div id="scoringEvents" className="empty">{"尚無得分紀錄"}</div>
</div>
</section>
<section className="card events recent-card collapsible-card" data-collapse-section>
<div className="section-head" data-collapse-head>
<h2 className="section-title">{"最近打席"}</h2>
<button className="collapse-toggle" type="button" aria-expanded="true" aria-controls="recentEventsBody" aria-label="收合最近打席"><span className="chev" aria-hidden="true">{"⌃"}</span></button>
</div>
<div id="recentEventsBody" className="collapse-body" data-collapse-body>
<div id="recentEvents" className="empty">{"尚無打席紀錄"}</div>
</div>
</section>
</div>
<div id="liveDetailSeries" className="live-detail-panel" data-live-panel="series">
<section className="card series-overview-card">
<div className="series-overview-head">
<div>
<div className="series-overview-eyebrow">{"CURRENT SERIES"}</div>
<h2 id="currentSeriesTitle">{"系列賽"}</h2>
<div id="currentSeriesSummary" className="series-overview-summary">{"等待系列賽資料"}</div>
</div>
</div>
<div id="currentSeriesGames" className="current-series-games">
<div className="series-overview-empty">{"等待系列賽資料…"}</div>
</div>
</section>
</div>
<div id="liveDetailRecap" className="live-detail-panel" data-live-panel="recap" hidden aria-hidden="true">
<section className="card recap-card">
<div className="recap-heading"><h2>{"賽後精華"}</h2><button id="recapRefreshBtn" type="button">{"重新整理"}</button></div>
<a className="recap-youtube-brand" href="https://www.youtube.com/" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><img src="./assets/youtube-logo.svg" alt="YouTube" width="108" height="24" /></a>
<p id="recapSummary" className="recap-summary">{"選擇比賽後查看官方頻道影片"}</p>
<div id="recapList" aria-live="polite"><div className="recap-empty">{"選擇比賽後查看精華"}</div></div>
</section>
</div>
</div>
</div>

</>});
