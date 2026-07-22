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
