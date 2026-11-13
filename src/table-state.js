// Phase I table tool fields and their defaults (see src/table.js). No dependencies, so src/state.js can load them first.
function fresh() {
  return {
    cues: [],
    nudges: [],
    balance: {},
    tension: { on: false, value: 0, label: 'Dread' },
    foreshadow: [],
    framing: {},
    canon: [],
    montage: { prompt: '', open: false, reveal: false, n: 0, answers: {} },
    stageLayout: 'auto',
    sessionNo: 1,
  };
}

// Fill in the fields older saves do not have.
function ensure(s) {
  const d = fresh();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  s.montage = { ...d.montage, ...s.montage };
  s.tension = { ...d.tension, ...s.tension };
}

module.exports = { fresh, ensure };
