// Pure draft math, independent of the database or UI.
// Pick numbers are 1-indexed (pick 1 = round 1, position 1).
// draftType is 'snake' (order reverses each round) or 'repeat' (same order
// every round) - defaults to 'snake' to match prior behavior.

export function getRound(pickNumber, numTeams) {
  return Math.ceil(pickNumber / numTeams);
}

// Given a pick number and team count, returns the 1-indexed draft
// position (1..numTeams) of the team that should be picking.
// Snake: odd rounds go 1..N, even rounds go N..1. Repeat: always 1..N.
export function getDraftPositionForPick(pickNumber, numTeams, draftType = 'snake') {
  const round = getRound(pickNumber, numTeams);
  const indexInRound = pickNumber - (round - 1) * numTeams; // 1..numTeams
  const isReversedRound = draftType === 'snake' && round % 2 === 0;
  return isReversedRound ? numTeams - indexInRound + 1 : indexInRound;
}

// Returns the team (from a teams array with a draft_position field)
// that is on the clock for a given pick number.
export function getTeamOnTheClock(pickNumber, numTeams, teams, draftType = 'snake') {
  const position = getDraftPositionForPick(pickNumber, numTeams, draftType);
  return teams.find((t) => t.draft_position === position) || null;
}

// Extended-phase-aware version, mirroring the get_team_on_clock SQL
// function exactly. Once clockPickNumber exceeds poolSize (the number of
// turns needed if nothing were ever skipped), remaining turns resolve to
// whichever teams were skipped, in the exact order they were skipped -
// not the standard rotation continuing to give every team extra turns
// equally. skipPickNumbers is the ordered list of pick_number values
// where a skip happened (player_id is null), ascending.
export function getTeamOnTheClockExtended(clockPickNumber, numTeams, teams, draftType, poolSize, skipPickNumbers) {
  if (clockPickNumber <= poolSize) {
    return getTeamOnTheClock(clockPickNumber, numTeams, teams, draftType);
  }
  const nthSkip = clockPickNumber - poolSize;
  const skipPickNumber = skipPickNumbers[nthSkip - 1];
  if (skipPickNumber === undefined) return null;
  return getTeamOnTheClock(skipPickNumber, numTeams, teams, draftType);
}

// Mirrors the get_extended_round SQL function exactly - determines which
// extended round a given extended-phase pick belongs in. Packs
// skip-resolutions so a new extended round only opens when a team would
// otherwise collide with itself in an already-open one; different teams
// freely share the same extended round. Processes every skip up through
// the requested one in chronological order, since each assignment
// depends on what came before it.
export function getExtendedRound(clockPickNumber, numTeams, teams, draftType, poolSize, skipPickNumbers) {
  const maxNormalRound = Math.ceil(poolSize / numTeams);
  const nthSkip = clockPickNumber - poolSize;
  if (nthSkip < 1 || nthSkip > skipPickNumbers.length) return null;

  const assignedTeams = [];
  const assignedRounds = [];
  let resultRound = null;

  for (let i = 1; i <= nthSkip; i++) {
    const skipPickNum = skipPickNumbers[i - 1];
    const skipTeam = getTeamOnTheClock(skipPickNum, numTeams, teams, draftType);
    const skipTeamId = skipTeam?.id;

    let candidateRound = 1;
    for (;;) {
      let isFree = true;
      for (let k = 0; k < assignedTeams.length; k++) {
        if (assignedTeams[k] === skipTeamId && assignedRounds[k] === candidateRound) {
          isFree = false;
          break;
        }
      }
      if (isFree) break;
      candidateRound += 1;
    }

    assignedTeams.push(skipTeamId);
    assignedRounds.push(candidateRound);
    if (i === nthSkip) resultRound = candidateRound;
  }

  return maxNormalRound + resultRound;
}

// Given a pick's clock number, returns its correct round - the normal
// round for a normal-phase pick, or the packed extended round for an
// extended-phase one. This is the single source of truth for "round"
// that every display should use, rather than recalculating round from a
// player's real (skip-excluding) pick number, which disagrees with this
// for any extended pick.
export function getRoundExtended(clockPickNumber, numTeams, teams, draftType, poolSize, skipPickNumbers) {
  if (clockPickNumber <= poolSize) {
    return getRound(clockPickNumber, numTeams);
  }
  return getExtendedRound(clockPickNumber, numTeams, teams, draftType, poolSize, skipPickNumbers);
}

// Builds the full pick order (array of {pickNumber, round, draftPosition})
// for a given number of teams and a total pick count - used for the "next 10
// picks" strip, the round-by-round view, and figuring out how many picks
// each team gets. totalPicks is normally the size of the active player pool,
// so the draft runs until every player is allocated rather than assuming a
// fixed number of rounds per team - the last round is simply partial if the
// pool doesn't divide evenly across teams.
export function buildFullPickOrder(numTeams, totalPicks, draftType = 'snake') {
  const order = [];
  for (let pick = 1; pick <= totalPicks; pick++) {
    order.push({
      pickNumber: pick,
      round: getRound(pick, numTeams),
      draftPosition: getDraftPositionForPick(pick, numTeams, draftType),
    });
  }
  return order;
}

// Randomly assigns draft_position 1..numTeams to a list of team ids.
// Returns an array of {id, draft_position} ready to write back to the DB.
export function randomizeDraftOrder(teamIds) {
  const shuffled = [...teamIds].sort(() => Math.random() - 0.5);
  return shuffled.map((id, i) => ({ id, draft_position: i + 1 }));
}

// The pick's position within its own round (1..numTeams), as opposed to the
// overall pick number across the whole draft - shown to spectators instead
// of the overall number so later rounds don't just look like escalating,
// discouraging numbers for players picked later in the draft.
export function pickInRound(pickNumber, numTeams) {
  const round = getRound(pickNumber, numTeams);
  return pickNumber - (round - 1) * numTeams;
}
