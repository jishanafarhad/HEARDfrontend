const QUALITY_LABELS = Object.freeze({
  very_poor: 'very poor',
  poor: 'poor',
  fair: 'fair',
  good: 'good',
  very_good: 'very good'
});

const PAIN_FACE_PHRASES = Object.freeze({
  0: 'no pain',
  2: 'a little pain',
  4: 'a bit more pain',
  6: 'quite a lot of pain',
  8: 'a lot of pain',
  10: 'the worst pain'
});

const MOOD_WEATHER_VALUES = Object.freeze(['sunny', 'cloudy', 'rainy', 'stormy']);
const ENERGY_SCORES = Object.freeze({ full: 0, half: 5, empty: 10 });
const MEDICINE_SLOT_LABELS = Object.freeze({
  morning: 'morning medicines',
  midday: 'midday medicines',
  evening: 'evening medicines',
  injection: 'injection',
  formula: 'formula'
});
const FORMULA_FRACTIONS = Object.freeze({ all: 1, most: 0.75, half: 0.5, little: 0.25, none: 0 });

let structuredContext = { childName: 'the child' };

export function configureStructuredContext(context = {}) {
  structuredContext = { ...structuredContext, ...context };
}

function localTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(date);
}

function bloodPhrase(value) {
  return {
    none: ' with no blood',
    little: ' with a little blood',
    lot: ' with a lot of blood'
  }[value] || '';
}

function medicineReasonPhrase(reason, parentLike) {
  const subject = parentLike ? 'they' : 'I';
  return {
    forgot: ` because ${subject} forgot`,
    felt_sick_after: ` because ${subject} felt sick after it`,
    ran_out: ` because ${subject} ran out`,
    felt_well: ` because ${subject} felt well`,
    other: ''
  }[reason] || '';
}

function medicineNamedPhrase(record) {
  const names = Array.isArray(record.med_names) ? record.med_names.filter(Boolean) : [];
  if (!names.length) return MEDICINE_SLOT_LABELS[record.slot];
  const timing = { morning: 'this morning', midday: 'at midday', evening: 'this evening' }[record.slot] || 'today';
  return `${names.join(' and ')} ${timing}`;
}

function dayNumber(dateValue) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ''));
  return match ? Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000) : null;
}

function todayDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function toSentence(record) {
  if (!record || typeof record !== 'object') throw new TypeError('A structured record is required.');
  const childName = structuredContext.childName || 'the child';

  if (record.slot && record.status) {
    if (!(record.slot in MEDICINE_SLOT_LABELS)) throw new RangeError('Unknown medicine slot.');
    if (record.status === 'not_logged') return null;
    const parentLike = record.reporter === 'parent' || record.reporter === 'school';
    const childSubject = record.reporter === 'child';
    const subject = childSubject ? 'I' : childName;
    const possessive = childSubject ? 'my' : 'their';

    if (record.slot === 'injection' && record.status === 'taken') {
      let late = '';
      if (record.on_time === false && record.due_date && record.taken_at) {
        const daysLate = dayNumber(String(record.taken_at).slice(0, 10)) - dayNumber(record.due_date);
        if (daysLate > 0) late = `, ${daysLate} ${daysLate === 1 ? 'day' : 'days'} late`;
      }
      return `${subject} ${childSubject ? 'had my' : 'had their'} injection today${late}.`;
    }

    if (record.slot === 'formula' && record.status === 'taken') {
      const fraction = { all: 'all of', most: 'most of', half: 'half of', little: 'a little of' }[record.formula_fraction];
      if (!fraction) throw new RangeError('A taken formula record requires a fraction.');
      return `${subject} drank ${fraction} ${possessive} formula today.`;
    }

    const slotPhrase = medicineNamedPhrase(record);
    if (record.status === 'taken') {
      return `${subject} took ${possessive} ${slotPhrase}${Array.isArray(record.med_names) && record.med_names.length ? '' : ' today'} at ${localTime(record.taken_at)}.`;
    }
    if (record.status === 'missed') {
      return `${subject} missed ${possessive} ${slotPhrase}${Array.isArray(record.med_names) && record.med_names.length ? '' : ' today'}${medicineReasonPhrase(record.reason, parentLike)}.`;
    }
    throw new RangeError('Unknown medicine status.');
  }

  if (record.mood_weather && record.energy) {
    if (!MOOD_WEATHER_VALUES.includes(record.mood_weather) || !(record.energy in ENERGY_SCORES)) {
      throw new RangeError('Unknown mood weather or energy value.');
    }
    const stormAbout = record.mood_weather === 'stormy' && record.storm_about
      ? ` about ${record.storm_about}`
      : '';
    if (record.reporter === 'child') {
      return `Today my mood is ${record.mood_weather}${stormAbout} and my energy is ${record.energy}.`;
    }
    const prefix = record.reporter === 'school' ? 'At school today' : 'Today';
    return `${prefix} ${childName}'s mood is ${record.mood_weather}${stormAbout}, and their energy is ${record.energy}.`;
  }

  if (Number.isInteger(record.pain_faces)) {
    const facePhrase = PAIN_FACE_PHRASES[record.pain_faces];
    if (!facePhrase) throw new RangeError('Unknown pain face.');
    const parentLike = record.reporter === 'parent' || record.reporter === 'school';
    const subject = record.reporter === 'school'
      ? `At school today, ${childName} had`
      : record.reporter === 'parent'
        ? `Today ${childName} has`
        : 'Today I have';

    if (record.pain_faces === 0) return `${subject} no pain.`;

    const places = Array.isArray(record.pain_where) ? record.pain_where : [];
    const where = places.length
      ? ` in ${parentLike ? 'their' : 'my'} ${places.join(' and ')}`
      : '';
    let interference = '';
    if (record.pain_interfered === 'yes') {
      interference = parentLike
        ? " and couldn't do their usual things"
        : " and I couldn't do my usual things";
    } else if (record.pain_interfered === 'no') {
      interference = parentLike
        ? ' but could still do their usual things'
        : ' but I could still do my usual things';
    }
    return `${subject} ${facePhrase}${where}${interference}.`;
  }

  if (Number.isInteger(record.bristol)) {
    const time = localTime(record.logged_at);
    const blood = bloodPhrase(record.blood);
    if (record.reporter === 'school') {
      return `At school, ${childName} did a poo at ${time}. Bristol type ${record.bristol}${blood}.`;
    }
    const subject = record.reporter === 'parent' ? `${childName} did a poo` : 'I did a poo';
    const wake = record.woke_me_up
      ? record.reporter === 'parent' ? ', and it woke them up' : ', and it woke me up'
      : '';
    return `${subject} at ${time}. It was Bristol type ${record.bristol}${blood}${wake}.`;
  }

  if (record.sleep_quality) {
    const quality = QUALITY_LABELS[record.sleep_quality];
    if (!quality) throw new RangeError('Unknown sleep quality.');
    const parentLike = record.reporter === 'parent' || record.reporter === 'school';
    const subject = parentLike ? `Last night ${childName}'s sleep was` : 'Last night my sleep was';
    let tummy = '';
    if (record.woken_by_tummy === 'yes') {
      tummy = parentLike
        ? ', and they were woken by tummy pain'
        : ', and I was woken by tummy pain without needing a poo';
    } else if (record.woken_by_tummy === 'no') {
      tummy = parentLike
        ? ", and they weren't woken by tummy pain"
        : ", and I wasn't woken by tummy pain";
    }
    return `${subject} ${quality}${tummy}.`;
  }

  throw new TypeError('Unsupported structured record.');
}

export function createStructuredPayload(button, record) {
  if (!['poo_parade', 'sleep', 'pain', 'mood_weather', 'medicine_time'].includes(button)) throw new RangeError('Unknown structured button.');
  const message = toSentence(record);
  if (!message) throw new RangeError('Not-logged records are stored locally and are never sent.');
  return {
    message,
    metadata: {
      source: 'game_mode',
      button,
      record
    }
  };
}

export function deriveDailyScores(date, pooRecords = [], sleepRecord = null, painRecords = [], moodRecord = null, medicineRecords = []) {
  const records = pooRecords.filter((record) => record?.date === date);
  const dailyPain = painRecords.filter((record) => record?.date === date && PAIN_FACE_PHRASES[record.pain_faces]);
  const stoolCount = records.length;
  const itemsLogged = [];
  const painFacesMax = dailyPain.length ? Math.max(...dailyPain.map((record) => record.pain_faces)) : null;
  const painInterferenceLogged = dailyPain.filter((record) => record.pain_interfered === 'yes' || record.pain_interfered === 'no');
  const painScore = painFacesMax === 0
    ? 0
    : painInterferenceLogged.length === 0
      ? null
      : painInterferenceLogged.some((record) => record.pain_interfered === 'yes') ? 10 : 5;
  const energyScore = moodRecord?.date === date && moodRecord.energy in ENERGY_SCORES
    ? ENERGY_SCORES[moodRecord.energy]
    : null;
  const dailyMedicines = medicineRecords.filter((record) => record?.date === date);
  const medicineCounts = {
    slots_scheduled: dailyMedicines.length,
    slots_taken: dailyMedicines.filter((record) => record.status === 'taken').length,
    slots_missed: dailyMedicines.filter((record) => record.status === 'missed').length,
    slots_not_logged: dailyMedicines.filter((record) => record.status === 'not_logged').length
  };
  if (painScore !== null) itemsLogged.push('pucai_pain', 'pcdai_pain');
  if (energyScore !== null) itemsLogged.push('pucai_activity', 'pcdai_general_wellbeing');
  if (stoolCount === 0) {
    if (sleepRecord?.date === date && sleepRecord.sleep_quality) itemsLogged.push('sleep_quality');
    if (sleepRecord?.date === date && sleepRecord.woken_by_tummy !== 'not_logged') itemsLogged.push('woken_by_tummy');
    return {
      date,
      stool_count: 0,
      pucai_stools: null,
      pucai_consistency: null,
      pucai_bleeding: null,
      pucai_nocturnal: null,
      pcdai_stools: null,
      pcdai_nocturnal_diarrhoea: null,
      pucai_pain: painScore,
      pcdai_pain: painScore,
      pain_faces_max: painFacesMax,
      pucai_activity: energyScore,
      pcdai_general_wellbeing: energyScore,
      ...medicineCounts,
      items_logged: itemsLogged
    };
  }

  itemsLogged.push('pucai_stools', 'pucai_consistency', 'pucai_bleeding', 'pucai_nocturnal');
  if (sleepRecord?.date === date && sleepRecord.sleep_quality) itemsLogged.push('sleep_quality');
  if (sleepRecord?.date === date && sleepRecord.woken_by_tummy !== 'not_logged') itemsLogged.push('woken_by_tummy');

  const looseCount = records.filter((record) => [6, 7].includes(record.bristol)).length;
  const softOrLooseCount = records.filter((record) => [5, 6, 7].includes(record.bristol)).length;
  const littleBlood = records.some((record) => record.blood === 'little');
  const lotBlood = records.some((record) => record.blood === 'lot');
  const bloodyCount = records.filter((record) => record.blood !== 'none').length;
  const bloodFraction = bloodyCount / stoolCount;
  const worstBristol = Math.max(...records.map((record) => record.bristol));
  const nocturnalDiarrhoea = records.some((record) => record.woke_me_up === true && [6, 7].includes(record.bristol));

  const pucaiStools = stoolCount <= 2 ? 0 : stoolCount <= 5 ? 5 : stoolCount <= 8 ? 10 : 15;
  const pucaiConsistency = worstBristol <= 4 ? 0 : worstBristol === 5 ? 5 : 10;
  const pucaiBleeding = lotBlood ? 30 : bloodFraction === 0 ? 0 : bloodFraction < 0.5 ? 10 : 20;
  const pucaiNocturnal = records.some((record) => record.woke_me_up === true) ? 10 : 0;
  const pcdaiStools = lotBlood || looseCount >= 6 || nocturnalDiarrhoea
    ? 10
    : (looseCount >= 2 && looseCount <= 5) || (softOrLooseCount <= 2 && littleBlood)
      ? 5
      : 0;

  return {
    date,
    stool_count: stoolCount,
    pucai_stools: pucaiStools,
    pucai_consistency: pucaiConsistency,
    pucai_bleeding: pucaiBleeding,
    pucai_nocturnal: pucaiNocturnal,
    pcdai_stools: pcdaiStools,
    pcdai_nocturnal_diarrhoea: nocturnalDiarrhoea,
    pucai_pain: painScore,
    pcdai_pain: painScore,
    pain_faces_max: painFacesMax,
    pucai_activity: energyScore,
    pcdai_general_wellbeing: energyScore,
    ...medicineCounts,
    items_logged: itemsLogged
  };
}

export function deriveAdherence(records = [], days = 7) {
  const span = Math.max(1, Number(days) || 1);
  const endDay = dayNumber(todayDateKey());
  const inWindow = records.filter((record) => {
    const recordDay = dayNumber(record?.date);
    return recordDay !== null && recordDay <= endDay && recordDay > endDay - span;
  });
  const scheduled = inWindow.length;
  const taken = inWindow.filter((record) => record.status === 'taken').length;
  const missed = inWindow.filter((record) => record.status === 'missed').length;
  const notLogged = inWindow.filter((record) => record.status === 'not_logged').length;
  const reasons = {};
  inWindow.filter((record) => record.status === 'missed' && record.reason).forEach((record) => {
    reasons[record.reason] = (reasons[record.reason] || 0) + 1;
  });
  const injections = inWindow.filter((record) => record.slot === 'injection');
  const injectionOnTime = injections.filter((record) => record.on_time === true).length;
  const formulaValues = inWindow
    .filter((record) => record.slot === 'formula' && record.formula_fraction in FORMULA_FRACTIONS)
    .map((record) => FORMULA_FRACTIONS[record.formula_fraction]);
  return {
    taken_pct: scheduled ? taken / scheduled : null,
    missed_pct: scheduled ? missed / scheduled : null,
    not_logged_pct: scheduled ? notLogged / scheduled : null,
    reasons,
    injections_on_time: `${injectionOnTime}/${injections.length}`,
    formula_avg_fraction: formulaValues.length ? formulaValues.reduce((sum, value) => sum + value, 0) / formulaValues.length : null
  };
}

export function missedBeforeFlare(records = [], flareDate) {
  const flareDay = dayNumber(flareDate);
  if (flareDay === null) return 0;
  return records.filter((record) => {
    const recordDay = dayNumber(record?.date);
    return recordDay !== null && recordDay < flareDay && recordDay >= flareDay - 14 && ['missed', 'not_logged'].includes(record.status);
  }).length;
}

if (typeof window !== 'undefined') {
  window.HEARDStructured = {
    QUALITY_LABELS,
    PAIN_FACE_PHRASES,
    MOOD_WEATHER_VALUES,
    ENERGY_SCORES,
    MEDICINE_SLOT_LABELS,
    FORMULA_FRACTIONS,
    configureStructuredContext,
    createStructuredPayload,
    deriveDailyScores,
    deriveAdherence,
    missedBeforeFlare,
    toSentence
  };
}
