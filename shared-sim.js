(function () {
  const ITEMS = [
    { id: 1, name: 'Kilopower Fission Reactor', mu: 4, desc: 'Compact nuclear power unit. 10 kW continuous output. Fuel lifetime: 10+ years. Independent of atmospheric conditions and dust.', tags: ['10 kW OUTPUT', 'DUST-INDEPENDENT', 'MAINTENANCE: MOD'], tt: ['power', 'dep', 'risk'], affects: 'ES' },
    { id: 2, name: 'High-Efficiency Solar Array Field', mu: 3, desc: 'Deployable photovoltaic array. 8 kW peak output. Performance degrades with dust accumulation without active cleaning provision.', tags: ['8 kW PEAK', 'DUST-SENSITIVE', 'DEGRADES OVER TIME'], tt: ['power', 'risk', 'risk'], affects: 'ES' },
    { id: 3, name: 'Electrostatic Dust Removal System', mu: 2, desc: 'Surface cleaning grid. Prevents dust accumulation on panels and sensors. No function without exposed solar systems.', tags: ['1 kW DRAW', 'SOLAR DEPENDENCY'], tt: ['power', 'dep'], affects: 'EP' },
    { id: 4, name: 'Autonomous Regolith Excavator', mu: 4, desc: 'Robotic excavation unit. Moves 5 m3/hour. Enables terrain modification, berm construction, and potential subsurface access.', tags: ['5 kW DRAW', 'SUBSURFACE CAPABLE', 'HIGH POWER COST'], tt: ['power', 'bonus', 'risk'], affects: 'EP' },
    { id: 5, name: 'Lava Tube Reconnaissance Rover', mu: 2, desc: 'LIDAR-equipped exploration rover. Maps subsurface void structures. No direct life-support function as a standalone item.', tags: ['2 kW DRAW', 'SUBSURFACE MAPPING'], tt: ['power', 'bonus'], affects: '-' },
    { id: 6, name: 'Inflatable Surface Habitat Module', mu: 3, desc: 'Multi-layer composite habitat for 8 crew. Minimal built-in radiation shielding. High thermal demand on surface.', tags: ['RADIATION RISK', 'HIGH THERMAL LOAD', '8 CREW CAPACITY'], tt: ['risk', 'risk', 'bonus'], affects: 'CS' },
    { id: 7, name: 'Regolith Shielding Printer', mu: 3, desc: 'ISRU additive manufacturing. Constructs 2 m regolith shell over habitat in approx. 30 days. Requires stable power.', tags: ['4 kW DRAW', '30-DAY BUILD TIME', 'POWER DEPENDENT'], tt: ['power', 'risk', 'dep'], affects: 'RS/EP' },
    { id: 8, name: 'Advanced Water Recycling System', mu: 3, desc: 'Closed-loop purification system. 95% recovery rate. Without this item, water reserves deplete and crew sustainability collapses over time.', tags: ['2 kW DRAW', '95% RECOVERY', 'CRITICAL SYSTEM'], tt: ['power', 'bonus', 'bonus'], affects: 'CS' },
    { id: 9, name: 'CO2 Processing Unit', mu: 3, desc: 'Sabatier reaction + oxygen extraction. Continuous O2 supply for 8 crew. Filter wear degrades function over time without spare seals.', tags: ['3 kW DRAW', 'CONTINUOUS O2', 'SEAL DEPENDENT'], tt: ['power', 'bonus', 'dep'], affects: 'CS' },
    { id: 10, name: 'Hydroponic Growth Chamber', mu: 3, desc: 'Produces 60% of crew food needs. Requires stable power and water input. High energy demand may compete with critical systems.', tags: ['3 kW DRAW', '60% FOOD SUPPLY', 'WATER DEPENDENT'], tt: ['power', 'bonus', 'dep'], affects: 'CS' },
    { id: 11, name: 'Thermal Regulation System', mu: 2, desc: 'Habitat temperature stabilisation. Higher energy load for surface structures vs. subsurface habitats. Removes thermal stress penalties.', tags: ['2 kW DRAW', 'THERMAL CONTROL'], tt: ['power', 'bonus'], affects: 'EP/CS' },
    { id: 12, name: 'Energy Storage Battery Bank', mu: 2, desc: '72-hour full backup capacity. Buffers power generation gaps and fluctuations. Not a substitute for primary generation.', tags: ['72-HR BACKUP', 'BUFFER ONLY'], tt: ['bonus', 'risk'], affects: 'ES/BC' },
    { id: 13, name: 'Mechanical Repair Toolkit & Spares', mu: 2, desc: 'Comprehensive maintenance kit. Prevents and reverses mechanical degradation. Critical for nuclear reactor upkeep and cascade failure prevention.', tags: ['MAINTENANCE CRITICAL', 'CASCADE PREVENTION'], tt: ['bonus', 'bonus'], affects: 'BC' },
    { id: 14, name: 'Robotic Maintenance Manipulator', mu: 2, desc: 'External repairs without EVA. Reduced effectiveness without repair toolkit. Protects crew from surface exposure during maintenance.', tags: ['NO-EVA REPAIR', 'TOOLKIT DEPENDENT'], tt: ['bonus', 'dep'], affects: 'BC' },
    { id: 15, name: 'Spare Air Filtration & Seal Kit', mu: 1, desc: 'Replacement seals and filters. Maintains pressurisation reliability and prevents CO2 unit degradation over mission duration.', tags: ['SEAL REPLACEMENT', 'O2 SYSTEM SUPPORT'], tt: ['bonus', 'bonus'], affects: 'BC/CS' },
    { id: 16, name: 'Circadian Lighting & Psych Module', mu: 1, desc: 'Simulated Earth lighting cycles. Counters long-duration psychological stress. Without it, crew performance degrades from Day 120.', tags: ['1 kW DRAW', 'PSYCH SUPPORT'], tt: ['power', 'bonus'], affects: 'CS' },
    { id: 17, name: 'High-Bandwidth Communication Array', mu: 2, desc: 'Earth-Mars communication link. Provides stable delayed transmission and crew morale support. No direct structural survival function.', tags: ['COMMS LINK', 'MORALE EFFECT'], tt: ['bonus', 'bonus'], affects: 'CS' },
    { id: 18, name: 'Ice Prospecting Ground Radar', mu: 2, desc: 'Detects subsurface ice deposits. Enables water extraction strategy planning. Limited value without processing capability.', tags: ['ICE DETECTION', 'WATER STRATEGY'], tt: ['bonus', 'dep'], affects: 'CS' },
    { id: 19, name: 'Pressurised Water Storage Tanks', mu: 2, desc: '180-day water reserve for 8 crew. Non-renewable. Without recycling, this is a countdown to water exhaustion, not a long-term solution.', tags: ['180-DAY RESERVE', 'NON-RENEWABLE'], tt: ['bonus', 'risk'], affects: 'CS' },
    { id: 20, name: 'Emergency Ration Reserve', mu: 2, desc: 'Full 180-day backup food supply. One-time buffer. Does not address systemic nutritional failure or cascade sustainability collapse.', tags: ['180-DAY FOOD', 'BUFFER ONLY'], tt: ['bonus', 'risk'], affects: 'CS' }
  ];

  const IDX_NAMES = {
    RS: 'Radiation Safety',
    ES: 'Energy Stability',
    EP: 'Environmental Protection',
    BC: 'Backup & Repair',
    CS: 'Crew Sustainability'
  };

  const BASE = { RS: 1.5, ES: 1.0, EP: 1.5, BC: 1.0, CS: 1.5 };
  const THRESH = { RS: 2.5, ES: 2.5, EP: 2.0, BC: 2.0, CS: 2.5 };
  const FLOORS = { RS: 1.5, ES: 1.5, EP: 1.0, BC: 1.0, CS: 2.0 };
  const WEIGHTS = { RS: 0.25, ES: 0.20, EP: 0.20, BC: 0.15, CS: 0.20 };

  const IMODS = {
    1: { RS: 0, ES: 2.0, EP: 0, BC: -0.5, CS: 0, pOut: 10, pDraw: 0 },
    2: { RS: 0, ES: 1.5, EP: 0, BC: 0, CS: 0, pOut: 8, pDraw: 0, deg: true },
    3: { RS: 0, ES: 0, EP: 0, BC: 0, CS: 0, pOut: 0, pDraw: 1 },
    4: { RS: 0, ES: 0, EP: 1.5, BC: 0, CS: 0, pOut: 0, pDraw: 5 },
    5: { RS: 0, ES: 0, EP: 0, BC: 0, CS: 0, pOut: 0, pDraw: 2 },
    6: { RS: -1.0, ES: 0, EP: -0.5, BC: 0, CS: 1.0, pOut: 0, pDraw: 0 },
    7: { RS: 1.5, ES: 0, EP: 1.0, BC: 0, CS: 0, pOut: 0, pDraw: 4 },
    8: { RS: 0, ES: 0, EP: 0, BC: 0, CS: 2.0, pOut: 0, pDraw: 2 },
    9: { RS: 0, ES: 0, EP: 0, BC: 0, CS: 1.5, pOut: 0, pDraw: 3 },
    10: { RS: 0, ES: 0, EP: 0, BC: 0, CS: 1.0, pOut: 0, pDraw: 3 },
    11: { RS: 0, ES: 0, EP: 1.0, BC: 0, CS: 0.5, pOut: 0, pDraw: 2 },
    12: { RS: 0, ES: 0.5, EP: 0, BC: 0.5, CS: 0, pOut: 0, pDraw: 0 },
    13: { RS: 0, ES: 0, EP: 0, BC: 2.0, CS: 0, pOut: 0, pDraw: 0 },
    14: { RS: 0, ES: 0, EP: 0, BC: 1.0, CS: 0, pOut: 0, pDraw: 0 },
    15: { RS: 0, ES: 0, EP: 0, BC: 1.0, CS: 0.3, pOut: 0, pDraw: 0 },
    16: { RS: 0, ES: 0, EP: 0, BC: 0, CS: 0.5, pOut: 0, pDraw: 1 },
    17: { RS: 0, ES: 0, EP: 0, BC: 0, CS: 0.3, pOut: 0, pDraw: 0 },
    18: { RS: 0, ES: 0, EP: 0, BC: 0, CS: 0.5, pOut: 0, pDraw: 0 },
    19: { RS: 0, ES: 0, EP: 0, BC: 0, CS: 1.0, pOut: 0, pDraw: 0 },
    20: { RS: 0, ES: 0, EP: 0, BC: 0, CS: 0.5, pOut: 0, pDraw: 0 }
  };

  function simulate(ids) {
    const has = function (id) { return ids.includes(id); };
    let pOut = 0;
    let pDraw = 0;

    ids.forEach(function (id) {
      pOut += IMODS[id].pOut;
      pDraw += IMODS[id].pDraw;
    });

    const deficit = Math.max(0, pDraw - pOut);
    let sc = Object.assign({}, BASE);

    ids.forEach(function (id) {
      const m = IMODS[id];
      sc.RS += m.RS;
      sc.ES += m.ES;
      sc.EP += m.EP;
      sc.BC += m.BC;
      sc.CS += m.CS;
    });

    if (deficit > 0) sc.ES -= deficit * 0.5;
    if (has(1) && !has(11)) sc.EP -= 0.3;
    if (has(4) && has(5)) {
      sc.RS += sc.ES >= 2.5 ? 2.0 : 0.5;
      sc.EP += sc.ES >= 2.5 ? 1.5 : 0.3;
    }
    if (has(6)) sc.RS -= 0.3;
    if (has(10) && !has(8)) sc.CS -= 0.7;
    if (has(1) && has(13)) sc.BC += 0.5;
    if (has(14) && !has(13)) sc.BC -= 0.7;

    Object.keys(sc).forEach(function (k) {
      sc[k] = Math.max(0.5, Math.round(sc[k] * 100) / 100);
    });

    const mv = Math.round(
      Object.keys(WEIGHTS).reduce(function (sum, key) {
        return sum + sc[key] * WEIGHTS[key];
      }, 0) * 100
    ) / 100;

    let failDay = null;
    let failIdx = null;
    let failReason = null;

    Object.keys(sc).forEach(function (key) {
      if (sc[key] < THRESH[key]) {
        const d = Math.max(0, Math.round(((sc[key] - FLOORS[key]) / 0.2) * 15));
        if (failDay === null || d < failDay) {
          failDay = d;
          failIdx = key;
        }
      }
    });

    if (has(2) && !has(3)) {
      const sd = 60;
      if (failDay === null || sd < failDay) {
        failDay = sd;
        failIdx = 'ES';
        failReason = 'Solar output degrading - atmospheric dust accumulation without cleaning provision';
      }
    }

    if (has(6) && !has(4) && !has(7)) {
      const rd = 27;
      if (failDay === null || rd < failDay) {
        failDay = rd;
        failIdx = 'RS';
        failReason = 'Surface habitat without radiation shielding - cumulative exposure exceeds 50 mSv threshold';
      }
    }

    if (!has(8)) {
      const wd = 90;
      if (failDay === null || wd < failDay) {
        failDay = wd;
        failIdx = 'CS';
        failReason = 'No water recycling - crew water supply non-renewable, Crew Sustainability in decline from Day 30';
      }
    }

    return {
      sc: sc,
      mv: mv,
      failDay: failDay,
      failIdx: failIdx,
      failReason: failReason,
      pOut: pOut,
      pDraw: pDraw,
      deficit: deficit,
      hasSolar: has(2),
      hasDust: has(3),
      hasSub: has(4) && has(5),
      hasHab: has(6),
      hasShield: has(7),
      hasWater: has(8),
      hasRepair: has(13),
      hasReactor: has(1)
    };
  }

  function getTrajectories(result) {
    const labels = [0, 30, 60, 90, 120, 150, 180];
    const data = { RS: [], ES: [], EP: [], BC: [], CS: [] };

    labels.forEach(function (day) {
      let rs = result.sc.RS;
      let es = result.sc.ES;
      let ep = result.sc.EP;
      let bc = result.sc.BC;
      let cs = result.sc.CS;

      if (result.hasSolar && !result.hasDust) {
        es -= (day / 30) * 0.3;
      }

      if (!result.hasWater && day > 30) {
        cs -= ((day - 30) / 30) * 0.5;
      }

      if (result.hasReactor && !result.hasRepair && day > 90) {
        bc -= ((day - 90) / 30) * 0.5;
      }

      if (result.hasHab && !result.hasShield && !result.hasSub) {
        rs -= (day / 27) * 0.9;
      }

      data.RS.push(Math.max(0, rs));
      data.ES.push(Math.max(0, es));
      data.EP.push(Math.max(0, ep));
      data.BC.push(Math.max(0, bc));
      data.CS.push(Math.max(0, cs));
    });

    return { labels: labels, data: data };
  }

  function getMissionStatus(result) {
    if (result.failDay !== null) return 'NON-VIABLE';
    if (result.mv >= 3.0) return 'VIABLE';
    return 'CRITICAL';
  }

  function getStatusClass(status) {
    if (status === 'VIABLE') return 'pass';
    if (status === 'NON-VIABLE') return 'fail';
    return 'warn';
  }

  window.MarsSim = {
    ITEMS: ITEMS,
    IDX_NAMES: IDX_NAMES,
    BASE: BASE,
    THRESH: THRESH,
    FLOORS: FLOORS,
    WEIGHTS: WEIGHTS,
    IMODS: IMODS,
    simulate: simulate,
    getTrajectories: getTrajectories,
    getMissionStatus: getMissionStatus,
    getStatusClass: getStatusClass
  };
})();
