// Pure snake-draft math, independent of the database or UI.
// Pick numbers are 1-indexed (pick 1 = round 1, position 1).

export function getRound(pickNumber, numTeams) {
  return Math.ceil(pickNumber / numTeams);
}

// Given a pick number and team count, returns the 1-indexed draft
// position (1..numTeams) of the team that should be picking.
// Odd rounds go 1..N, even rounds go N..1 (the "snake").
export function getDraftPositionForPick(pickNumber, numTeams) {
  const round = getRound(pickNumber, numTeams);
  const indexInRound = pickNumber - (round - 1) * numTeams; // 1..numTeams
  const isReversedRound = round % 2 === 0;
  return isReversedRound ? numTeams - indexInRound + 1 : indexInRound;
}

// Returns the team (from a teams array with a draft_position field)
// that is on the clock for a given pick number.
export function getTeamOnTheClock(pickNumber, numTeams, teams) {
  const position = getDraftPositionForPick(pickNumber, numTeams);
  return teams.find((t) => t.draft_position === position) || null;
}

// Builds the full pick order (array of {pickNumber, round, draftPosition})
// for a given number of teams and rounds - used for the "next 10 picks" strip.
export function buildFullPickOrder(numTeams, totalRounds) {
  const order = [];
  for (let pick = 1; pick <= numTeams * totalRounds; pick++) {
    order.push({
      pickNumber: pick,
      round: getRound(pick, numTeams),
      draftPosition: getDraftPositionForPick(pick, numTeams),
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
