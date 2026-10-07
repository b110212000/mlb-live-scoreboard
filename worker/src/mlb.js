const MLB_API = "https://statsapi.mlb.com/api";

export async function fetchGameSnapshot(gamePk) {
  const url = `${MLB_API}/v1.1/game/${encodeURIComponent(gamePk)}/feed/live`;
  const response = await fetch(url, {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    throw new Error(`MLB API HTTP ${response.status}`);
  }

  const feed = await response.json();
  const status = feed?.gameData?.status || {};
  const linescore = feed?.liveData?.linescore || {};
  const plays = feed?.liveData?.plays || {};
  const allPlays = plays.allPlays || [];
  const scoringIndexes = Array.isArray(plays.scoringPlays) ? plays.scoringPlays : [];
  const latestScoringIndex = scoringIndexes.length
    ? scoringIndexes[scoringIndexes.length - 1]
    : null;
  const latestScoringPlay = latestScoringIndex == null
    ? null
    : allPlays[latestScoringIndex] || null;

  return {
    gamePk: Number(gamePk),
    abstractState: status.abstractGameState || "",
    detailedState: status.detailedState || "",
    awayScore: Number(linescore?.teams?.away?.runs ?? 0),
    homeScore: Number(linescore?.teams?.home?.runs ?? 0),
    scoringCount: scoringIndexes.length,
    latestScoringIndex,
    latestScoringPlay
  };
}

export function isLiveGame(snapshot) {
  const text = `${snapshot?.abstractState || ""} ${snapshot?.detailedState || ""}`;
  return /live|in progress|inning/i.test(text);
}

export function isFinalGame(snapshot) {
  const text = `${snapshot?.abstractState || ""} ${snapshot?.detailedState || ""}`;
  return /final|game over|completed/i.test(text);
}

export function scoringSummary(snapshot) {
  const play = snapshot?.latestScoringPlay;
  if (!play) return null;

  return {
    gamePk: snapshot.gamePk,
    awayScore: snapshot.awayScore,
    homeScore: snapshot.homeScore,
    inning: play?.about?.inning ?? null,
    halfInning: play?.about?.halfInning || "",
    event: play?.result?.event || "",
    description: play?.result?.description || ""
  };
}
