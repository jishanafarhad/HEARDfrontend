import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureStructuredContext,
  createStructuredPayload,
  deriveAdherence,
  deriveDailyScores,
  missedBeforeFlare,
  toSentence
} from '../heard-structured.js';

configureStructuredContext({ childName: 'Zara' });

const poo = (overrides = {}) => ({
  id: 'poo-1',
  date: '2026-09-19',
  logged_at: '2026-09-19T01:15:00.000Z',
  reporter: 'child',
  bristol: 4,
  blood: 'none',
  woke_me_up: false,
  ...overrides
});

const pain = (overrides = {}) => ({
  date: '2026-09-19',
  logged_at: '2026-09-19T08:00:00.000Z',
  reporter: 'child',
  pain_faces: 6,
  pain_interfered: 'no',
  pain_where: ['tummy'],
  ...overrides
});

const moodWeather = (overrides = {}) => ({
  date: '2026-09-19',
  logged_at: '2026-09-19T08:30:00.000Z',
  reporter: 'child',
  mood_weather: 'sunny',
  energy: 'full',
  storm_about: null,
  ...overrides
});

const medicine = (overrides = {}) => ({
  date: '2026-09-19',
  slot: 'morning',
  status: 'taken',
  reason: null,
  formula_fraction: null,
  taken_at: '2026-09-19T01:15:00.000Z',
  reporter: 'child',
  med_names: [],
  mars5: {},
  ...overrides
});

function dateKeyOffset(offset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('serialises Poo Parade records for every reporter', () => {
  const child = toSentence(poo());
  assert.match(child, /^I did a poo at .+\. It was Bristol type 4 with no blood\.$/);

  const parent = toSentence(poo({ reporter: 'parent', blood: 'little', woke_me_up: true }));
  assert.match(parent, /^Zara did a poo at .+\. It was Bristol type 4 with a little blood, and it woke them up\.$/);

  const school = toSentence(poo({ reporter: 'school', blood: 'lot', woke_me_up: true }));
  assert.match(school, /^At school, Zara did a poo at .+\. Bristol type 4 with a lot of blood\.$/);
});

test('serialises sleep tri-state without inferring an untapped answer', () => {
  const base = { date: '2026-09-19', logged_at: '2026-09-19T08:00:00.000Z', reporter: 'child', sleep_quality: 'very_poor' };
  assert.equal(toSentence({ ...base, woken_by_tummy: 'not_logged' }), 'Last night my sleep was very poor.');
  assert.equal(toSentence({ ...base, woken_by_tummy: 'no' }), "Last night my sleep was very poor, and I wasn't woken by tummy pain.");
  assert.equal(toSentence({ ...base, woken_by_tummy: 'yes' }), 'Last night my sleep was very poor, and I was woken by tummy pain without needing a poo.');
});

test('creates a sentence-first API payload with the record in metadata', () => {
  const record = poo({ bristol: 6 });
  const payload = createStructuredPayload('poo_parade', record);
  assert.match(payload.message, /Bristol type 6/);
  assert.deepEqual(payload.metadata, { source: 'game_mode', button: 'poo_parade', record });
});

test('serialises Pain records for child, parent, school, and no pain', () => {
  assert.equal(toSentence(pain()), 'Today I have quite a lot of pain in my tummy but I could still do my usual things.');
  assert.equal(
    toSentence(pain({ reporter: 'parent', pain_faces: 8, pain_interfered: 'yes', pain_where: ['tummy', 'joints'] })),
    "Today Zara has a lot of pain in their tummy and joints and couldn't do their usual things."
  );
  assert.equal(
    toSentence(pain({ reporter: 'school', pain_faces: 4, pain_interfered: 'not_logged', pain_where: ['head'] })),
    'At school today, Zara had a bit more pain in their head.'
  );
  assert.equal(toSentence(pain({ pain_faces: 0, pain_interfered: 'yes', pain_where: ['tummy'] })), 'Today I have no pain.');
});

test('creates the required pain API payload', () => {
  const record = pain();
  assert.deepEqual(createStructuredPayload('pain', record), {
    message: 'Today I have quite a lot of pain in my tummy but I could still do my usual things.',
    metadata: { source: 'game_mode', button: 'pain', record }
  });
});

test('serialises Mood Weather without creating a separate stress field', () => {
  assert.equal(toSentence(moodWeather()), 'Today my mood is sunny and my energy is full.');
  assert.equal(
    toSentence(moodWeather({ reporter: 'parent', mood_weather: 'stormy', energy: 'half', storm_about: 'school' })),
    "Today Zara's mood is stormy about school, and their energy is half."
  );
  assert.equal(
    toSentence(moodWeather({ reporter: 'school', mood_weather: 'cloudy', energy: 'empty' })),
    "At school today Zara's mood is cloudy, and their energy is empty."
  );
});

test('creates one sentence-first Mood Weather payload with separate record fields', () => {
  const record = moodWeather({ mood_weather: 'stormy', energy: 'half', storm_about: 'tummy' });
  assert.deepEqual(createStructuredPayload('mood_weather', record), {
    message: 'Today my mood is stormy about tummy and my energy is half.',
    metadata: { source: 'game_mode', button: 'mood_weather', record }
  });
});

test('serialises Medicine Time slots, optional names, reasons, injection timing, and formula', () => {
  assert.match(toSentence(medicine()), /^I took my morning medicines today at .+\.$/);
  assert.equal(
    toSentence(medicine({ reporter: 'parent', status: 'missed', reason: 'forgot', taken_at: null, med_names: ['Tummy Shield', 'vitamin'] })),
    'Zara missed their Tummy Shield and vitamin this morning because they forgot.'
  );
  assert.equal(
    toSentence(medicine({ slot: 'injection', due_date: '2026-09-15', on_time: false })),
    'I had my injection today, 4 days late.'
  );
  assert.equal(
    toSentence(medicine({ reporter: 'parent', slot: 'formula', formula_fraction: 'half' })),
    'Zara drank half of their formula today.'
  );
});

test('never sends a not-logged medicine record', () => {
  const record = medicine({ status: 'not_logged', taken_at: null });
  assert.equal(toSentence(record), null);
  assert.throws(() => createStructuredPayload('medicine_time', record), /never sent/);
});

test('creates the required Medicine Time payload', () => {
  const record = medicine();
  const payload = createStructuredPayload('medicine_time', record);
  assert.match(payload.message, /morning medicines/);
  assert.deepEqual(payload.metadata, { source: 'game_mode', button: 'medicine_time', record });
});

test('returns null poo-derived values when no poo was logged', () => {
  const scores = deriveDailyScores('2026-09-19', [], {
    date: '2026-09-19', sleep_quality: 'poor', woken_by_tummy: 'yes'
  });
  assert.equal(scores.stool_count, 0);
  assert.equal(scores.pucai_stools, null);
  assert.equal(scores.pucai_nocturnal, null);
  assert.equal(scores.pcdai_nocturnal_diarrhoea, null);
  assert.deepEqual(scores.items_logged, ['sleep_quality', 'woken_by_tummy']);
});

test('derives PUCAI and PCDAI items from individual outputs', () => {
  const records = [
    poo({ id: '1', bristol: 6, blood: 'little' }),
    poo({ id: '2', bristol: 7, blood: 'none', woke_me_up: true }),
    poo({ id: '3', bristol: 5, blood: 'none' })
  ];
  const scores = deriveDailyScores('2026-09-19', records, null);
  assert.equal(scores.stool_count, 3);
  assert.equal(scores.pucai_stools, 5);
  assert.equal(scores.pucai_consistency, 10);
  assert.equal(scores.pucai_bleeding, 10);
  assert.equal(scores.pucai_nocturnal, 10);
  assert.equal(scores.pcdai_nocturnal_diarrhoea, true);
  assert.equal(scores.pcdai_stools, 10);
});

test('scores a lot of blood as 30 and ignores sleep for nocturnal stool items', () => {
  const records = [poo({ blood: 'lot', bristol: 4 })];
  const scores = deriveDailyScores('2026-09-19', records, {
    date: '2026-09-19', sleep_quality: 'poor', woken_by_tummy: 'yes'
  });
  assert.equal(scores.pucai_bleeding, 30);
  assert.equal(scores.pucai_nocturnal, 0);
  assert.equal(scores.pcdai_nocturnal_diarrhoea, false);
  assert.equal(scores.pcdai_stools, 10);
});

test('applies every stool-frequency band', () => {
  const make = (count) => Array.from({ length: count }, (_, index) => poo({ id: String(index) }));
  assert.equal(deriveDailyScores('2026-09-19', make(2), null).pucai_stools, 0);
  assert.equal(deriveDailyScores('2026-09-19', make(5), null).pucai_stools, 5);
  assert.equal(deriveDailyScores('2026-09-19', make(8), null).pucai_stools, 10);
  assert.equal(deriveDailyScores('2026-09-19', make(9), null).pucai_stools, 15);
});

test('does not score positive pain intensity without an interference answer', () => {
  const scores = deriveDailyScores('2026-09-19', [], null, [
    pain({ pain_faces: 10, pain_interfered: 'not_logged' })
  ]);
  assert.equal(scores.pain_faces_max, 10);
  assert.equal(scores.pucai_pain, null);
  assert.equal(scores.pcdai_pain, null);
});

test('maps any positive pain that did not interfere to five regardless of face', () => {
  const scores = deriveDailyScores('2026-09-19', [], null, [
    pain({ pain_faces: 10, pain_interfered: 'no' })
  ]);
  assert.equal(scores.pain_faces_max, 10);
  assert.equal(scores.pucai_pain, 5);
  assert.equal(scores.pcdai_pain, 5);
});

test('scores pain only from interference and keeps the worst face for the trend', () => {
  const scores = deriveDailyScores('2026-09-19', [], null, [
    pain({ pain_faces: 10, pain_interfered: 'not_logged' }),
    pain({ pain_faces: 4, pain_interfered: 'no' }),
    pain({ pain_faces: 2, pain_interfered: 'yes' })
  ]);
  assert.equal(scores.pain_faces_max, 10);
  assert.equal(scores.pucai_pain, 10);
  assert.equal(scores.pcdai_pain, 10);
});

test('scores logged no-pain as zero without requiring the hidden follow-up', () => {
  const scores = deriveDailyScores('2026-09-19', [], null, [pain({ pain_faces: 0, pain_interfered: 'not_logged', pain_where: [] })]);
  assert.equal(scores.pain_faces_max, 0);
  assert.equal(scores.pucai_pain, 0);
  assert.equal(scores.pcdai_pain, 0);
});

test('maps energy independently to PUCAI activity and PCDAI general well-being', () => {
  for (const [energy, expected] of [['full', 0], ['half', 5], ['empty', 10]]) {
    const scores = deriveDailyScores('2026-09-19', [], null, [], moodWeather({ mood_weather: 'stormy', energy }));
    assert.equal(scores.pucai_activity, expected);
    assert.equal(scores.pcdai_general_wellbeing, expected);
  }
});

test('does not derive an activity score from mood weather alone', () => {
  const scores = deriveDailyScores('2026-09-19', [], null, [], {
    ...moodWeather({ mood_weather: 'rainy' }), energy: undefined
  });
  assert.equal(scores.pucai_activity, null);
  assert.equal(scores.pcdai_general_wellbeing, null);
});

test('derives independent daily medicine slot counts', () => {
  const records = [
    medicine({ status: 'taken' }),
    medicine({ slot: 'evening', status: 'missed', reason: 'ran_out', taken_at: null }),
    medicine({ slot: 'formula', status: 'not_logged', taken_at: null })
  ];
  const scores = deriveDailyScores('2026-09-19', [], null, [], null, records);
  assert.equal(scores.slots_scheduled, 3);
  assert.equal(scores.slots_taken, 1);
  assert.equal(scores.slots_missed, 1);
  assert.equal(scores.slots_not_logged, 1);
});

test('derives 7-day adherence without merging missed and not logged', () => {
  const today = dateKeyOffset(0);
  const records = [
    medicine({ date: today, status: 'taken' }),
    medicine({ date: today, slot: 'evening', status: 'missed', reason: 'forgot', taken_at: null }),
    medicine({ date: today, slot: 'midday', status: 'not_logged', taken_at: null }),
    medicine({ date: today, slot: 'injection', status: 'taken', on_time: true }),
    medicine({ date: today, slot: 'formula', status: 'taken', formula_fraction: 'half' }),
    medicine({ date: dateKeyOffset(-8), status: 'missed', reason: 'ran_out', taken_at: null })
  ];
  const result = deriveAdherence(records, 7);
  assert.equal(result.taken_pct, 3 / 5);
  assert.equal(result.missed_pct, 1 / 5);
  assert.equal(result.not_logged_pct, 1 / 5);
  assert.deepEqual(result.reasons, { forgot: 1 });
  assert.equal(result.injections_on_time, '1/1');
  assert.equal(result.formula_avg_fraction, 0.5);
});

test('counts missed and not-logged slots in the fourteen days before a flare', () => {
  const records = [
    medicine({ date: '2026-09-18', status: 'missed', taken_at: null }),
    medicine({ date: '2026-09-10', status: 'not_logged', taken_at: null }),
    medicine({ date: '2026-09-05', status: 'missed', taken_at: null }),
    medicine({ date: '2026-09-04', status: 'missed', taken_at: null })
  ];
  assert.equal(missedBeforeFlare(records, '2026-09-19'), 3);
});
