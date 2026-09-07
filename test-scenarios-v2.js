export const TEST_SCENARIOS_V2 = Object.freeze({
  'hill-climb': Object.freeze({
    id: 'hill-climb', short: 'HILL', title: 'Hill Climb 22°', statusTitle: 'HILL CLIMB',
    surface: 'concrete', warmupSeconds: 0.5, countdownSeconds: 3,
    scoring: { kind: 'time', better: 'lower', unit: 's' },
    world: { angleDeg: 22, lengthStud: 18, widthStud: 8, thicknessStud: 0.5, startZStud: 3 },
  }),
  'torque-pull': Object.freeze({
    id: 'torque-pull', short: 'PULL', title: 'Pull / Torque Bench', statusTitle: 'PULL / TORQUE',
    surface: 'asphalt', warmupSeconds: 0.5, countdownSeconds: 3,
    scoring: { kind: 'force', better: 'higher', unit: 'N' },
    load: { startN: 0.1, maxN: 3.5, rampNPerSecond: 0.32 },
  }),
  'obstacle-course': Object.freeze({
    id: 'obstacle-course', short: 'OBST', title: 'Obstacle Course', statusTitle: 'OBSTACLE COURSE',
    surface: 'concrete', warmupSeconds: 0.5, countdownSeconds: 3,
    scoring: { kind: 'time', better: 'lower', unit: 's' },
    world: { finishZStud: 20 },
  }),
  'dyno-bench': Object.freeze({
    id: 'dyno-bench', short: 'DYNO', title: 'Dyno Bench', statusTitle: 'DYNO BENCH',
    surface: 'concrete', warmupSeconds: 0.5, countdownSeconds: 3,
    scoring: { kind: 'power', better: 'higher', unit: 'W' },
    dyno: { durationSeconds: 12, brakeGain: 0.012, maxBrakeTorqueNm: 0.10 },
  }),
})

export const getTestScenarioV2 = id => TEST_SCENARIOS_V2[id] ?? null
