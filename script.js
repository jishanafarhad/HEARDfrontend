/* ---------- Element references ---------- */
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const appShell = document.querySelector('.app');
const views = {
  chat: document.querySelector('#chat-view'),
  game: document.querySelector('#game-view')
};
const chatForm = document.querySelector('#chat-form');
const messageInput = document.querySelector('#message-input');
const messages = document.querySelector('#messages');
const chatResizeHandle = document.querySelector('#chat-resize-handle');
const communityButton = document.querySelector('#community-button');
const learnButton = document.querySelector('#learn-button');
const unlockOverlay = document.querySelector('#unlock-overlay');
const unlockReveal = document.querySelector('#unlock-reveal');
const unlockSkip = document.querySelector('#unlock-skip');
const destinationPage = document.querySelector('#destination-page');
const destinationBack = document.querySelector('#destination-back');
const destinationKicker = document.querySelector('#destination-kicker');
const destinationTitle = document.querySelector('#destination-title');
const destinationContent = document.querySelector('#destination-content');
const sendButton = chatForm.querySelector('.send-button');
const photoButton = document.querySelector('#photo-button');
const voiceButton = document.querySelector('#voice-button');
const flareButton = document.querySelector('#flare-button');
const photoInput = document.querySelector('#photo-input');
const photoDraft = document.querySelector('#photo-draft');
const photoDraftImage = document.querySelector('#photo-draft-image');
const photoDraftRemove = document.querySelector('#photo-draft-remove');
const menu = document.querySelector('#menu');
const menuButton = document.querySelector('#menu-button');
const toast = document.querySelector('#toast');
const gameTiles = [...document.querySelectorAll('[data-game-tile]')];

let activeMode = 'chat';
let weeklyCheckIns = 2;
let weeklyGoal = 3;
let savedPatientId = '';
let toastTimer;
let speechRecognition = null;
let voiceStartPending = false;
let recordingTimer = null;
let voiceTranscript = '';
let voiceFinalTranscript = '';
let voiceDraftText = '';
let voiceRecognitionError = '';
let flareCaptureMode = false;
let pendingPhotoAttachment = null;
let pendingPhotoPreviewUrl = '';
let chatTopRatio = 0.38;
let chatHistoryTop = 0;

const chatEndpoint = 'https://unfactional-chaya-remoter.ngrok-free.dev/api/patient/chat/create';
// Production by default; local development can set window.HEARD_API_BASE_URL
// to "http://127.0.0.1:8000" before this script loads.
const journalApiBase = String(window.HEARD_API_BASE_URL || 'https://unfactional-chaya-remoter.ngrok-free.dev').replace(/\/+$/, '');
const journalRequestHeaders = Object.freeze({
  Accept: 'application/json',
  'ngrok-skip-browser-warning': 'true'
});
const patientJournalUrl = (patientId) => `${journalApiBase}/api/patient/${encodeURIComponent(patientId)}`;
const journalEntryUrl = (entryId) => `${journalApiBase}/api/entry/${encodeURIComponent(entryId)}`;
const journalDailySummaryUrl = `${journalApiBase}/api/patient/daily-summary`;
const journalMonthlySummaryUrl = `${journalApiBase}/api/patient/monthly-summary`;
const journalMediaBaseUrl = `${journalApiBase}/`;
const shareDestinationUrl = 'https://jishanafarhad.github.io/HEARDHackitRx/';
// Keep backend routes in one place; update these two constants if Django exposes different profile paths.
const profileEndpoint = 'https://unfactional-chaya-remoter.ngrok-free.dev/api/patient/profile/update';
const profileInterpretEndpoint = 'https://unfactional-chaya-remoter.ngrok-free.dev/api/patient/profile/interpret';
const chatResponseBy = 'HumanMessage';
const photoUploadField = 'Image';
const foodImageConversationText = 'Please log this food image for me';
const flareConversationPrefix = 'I am having a flare.';
const maxPhotoBytes = 10 * 1024 * 1024;
const maxVoiceDurationMs = 60 * 1000;
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const routingConfig = Object.freeze({
  bloodToNurse: ['mixed', 'mostly'],
  urgentPattern: /fever|can(?:not|'t) keep fluids down|vomit/i,
  nurseName: 'Sister Devi',
  nurseReplyTime: '1 working day',
  lowEnergyDays: 7,
  lowEnergyWindowDays: 14
});

/* ---------- Small shared helpers ---------- */
function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function buildFlareConversationText(text) {
  return `${flareConversationPrefix} ${text.trim()}`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1900);
}

function scrollChatToLatest(behavior = 'smooth') {
  messages.scrollTo({ top: messages.scrollHeight, behavior });
}

function cleanPatientRecord(value) {
  return String(value || '')
    .trim()
    .replace(/["'“”‘’]/g, '')
    .replace(/\s+/g, '');
}

function isValidPatientRecord(value) {
  return uuidPattern.test(value);
}

/* ---------- Journal data: one stream, many views ---------- */
const journalStorageKey = 'heard-journal-entries-v1';
const questFieldTypes = ['energy', 'sleep', 'stool_type', 'blood', 'pain', 'medicine'];
const journalSectionTypes = {
  Symptoms: ['energy', 'sleep', 'mood', 'toilet_trips', 'stool_type', 'blood', 'pain', 'reflect', 'toilet'],
  Food: ['food'],
  Medicines: ['medicine'],
  'Life & care': ['note', 'flare_report', 'appointment', 'doctor_appointment', 'result', 'doctor_said', 'goal', 'story']
};
const sourceLabels = {
  quest_tap: 'tapped', chat: 'from chat', caregiver: 'caregiver', school: 'school',
  instrument: 'instrument', clinician: 'Dr Nair'
};

function toDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function makeEntry(type, value, source = 'quest_tap', date = toDateKey(), extras = {}) {
  const now = new Date();
  return {
    entry_id: crypto.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date,
    time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    created_at: now.toISOString(),
    type,
    value,
    source,
    confidence: source === 'chat' ? 1 : null,
    raw_text: source === 'chat' ? extras.raw_text || '' : '',
    private: Boolean(extras.private),
    ask_team: Boolean(extras.ask_team),
    added_later: Boolean(extras.added_later),
    demo_calendar: Boolean(extras.demo_calendar),
    history: extras.history || []
  };
}

function loadJournalEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem(journalStorageKey));
    if (Array.isArray(saved)) return saved;
  } catch {
    // Start with an empty patient record when storage is unavailable.
  }
  return [];
}

let journalEntries = loadJournalEntries();

function saveJournalEntries() {
  try {
    localStorage.setItem(journalStorageKey, JSON.stringify(journalEntries));
  } catch {
    // The journal remains usable for this session.
  }
}

function addJournalEntry(type, value, extras = {}) {
  const created = new Date();
  if (!extras.date && created.getHours() < 5) created.setDate(created.getDate() - 1);
  const entry = makeEntry(type, value, extras.source || 'quest_tap', extras.date || toDateKey(created), extras);
  journalEntries.push(entry);
  saveJournalEntries();
  return entry;
}

/* ---------- Chat/game switching ---------- */
function setMode(nextMode) {
  if (!views[nextMode] || nextMode === activeMode) return;

  if (nextMode === 'chat' && typeof closeObjectSheet === 'function' && !objectSheet.hidden) closeObjectSheet();

  activeMode = nextMode;
  document.querySelector('.app').classList.toggle('is-game-mode', nextMode === 'game');
  modeButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === nextMode));
  });

  Object.entries(views).forEach(([name, view]) => {
    const isActive = name === nextMode;
    view.classList.toggle('is-active', isActive);
    view.setAttribute('aria-hidden', String(!isActive));
  });

  if (nextMode === 'chat') {
    scrollChatToLatest('auto');
    window.setTimeout(() => messageInput.focus(), 250);
  }
  if (nextMode === 'game') renderRoomState();
}

modeButtons.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

function openDestination(destination) {
  const isLearning = destination === 'learning';
  destinationPage.classList.toggle('destination-page--community', !isLearning);
  destinationKicker.textContent = isLearning ? 'LEARN A LITTLE' : 'YOU’RE NOT ALONE';
  destinationTitle.textContent = isLearning ? 'Learning Corner' : 'Community';
  if (isLearning) {
    renderLearningHome();
  } else {
    renderCommunityHome();
  }
  destinationPage.hidden = false;
  destinationPage.setAttribute('aria-hidden', 'false');
  window.requestAnimationFrame(() => destinationPage.classList.add('is-open'));
  destinationBack.focus();
}

function renderLearningHome() {
  destinationKicker.textContent = 'LEARN A LITTLE';
  destinationTitle.textContent = 'Learning Corner';
  destinationContent.innerHTML = `
    <section class="learning-welcome"><small>FOLLOW YOUR CURIOSITY</small><h3>Pick what feels easy today</h3><p>Take the 20-second answer or explore further. No tests, scores or streaks.</p></section>
    <section class="learning-path-picker" aria-labelledby="learning-path-title"><small>EXPLORE BY THEME</small><h3 id="learning-path-title">Life with IBD, not homework</h3><div class="learning-path-chips"><button class="is-selected" type="button" data-learning-path="ibd">Understand my IBD</button><button type="button" data-learning-path="body">Understand my body</button><button type="button" data-learning-path="living">Living with IBD</button><button type="button" data-learning-path="mind">Mind &amp; me</button><button type="button" data-learning-path="speak">Speak up</button></div><p id="learning-path-copy">Crohn’s and UC, remission, inflammation, tests and medicines.</p></section>
    <div class="learning-grid learning-format-grid">
      <button class="learning-card learning-card--more" type="button" data-learning-format="tell-more"><span>🔎</span><span><em>YOU CHOOSE THE DEPTH</em><strong>Tell Me More</strong><small>Biologics—in one sentence, or explore your questions.</small><i class="participation-xp">+5 XP</i></span><b>›</b></button>
      <button class="learning-card learning-card--read" type="button" data-learning-format="quick-read"><span>📖</span><span><em>30–60 SEC</em><strong>Quick Read</strong><small>Why am I tired even when my Crohn’s is quiet?</small><i class="participation-xp">+5 XP</i></span><b>›</b></button>
      <button class="learning-card learning-card--reveal" type="button" data-learning-format="tap-reveal"><span>👆</span><span><em>GUESS, THEN REVEAL</em><strong>Tap to Reveal</strong><small>Can stress cause an IBD flare?</small><i class="participation-xp">+5 XP</i></span><b>›</b></button>
      <button class="learning-card learning-card--myth" type="button" data-learning-format="myth-fact"><span>🧠</span><span><em>ONE QUICK CHOICE</em><strong>Myth or Fact</strong><small>If I feel well, my inflammation must be gone.</small><i class="participation-xp">+5 XP</i></span><b>›</b></button>
      <button class="learning-card learning-card--scenario" type="button" data-learning-format="scenario"><span>🎭</span><span><em>REAL-LIFE PRACTICE</em><strong>What Would You Do?</strong><small>Going out with friends when food feels uncertain.</small><i class="participation-xp">+5 XP</i></span><b>›</b></button>
      <button class="learning-card learning-card--try" type="button" data-learning-format="one-thing"><span>💭</span><span><em>A MOMENT FOR YOU</em><strong>One Thing to Try</strong><small>Name something you enjoyed today beyond IBD.</small><i class="participation-xp">+5 XP</i></span><b>›</b></button>
    </div>`;
}

function learningActivityShell(format, label, title, body) {
  destinationKicker.textContent = label.toUpperCase();
  destinationTitle.textContent = title;
  destinationContent.innerHTML = `<button class="learning-inline-back" type="button" data-learning-back>‹ <span>All mini-lessons</span></button><article class="learning-activity learning-activity--${format}">${body}</article>`;
  destinationContent.scrollTop = 0;
}

function openLearningFormat(format) {
  if (format === 'tell-more') {
    learningActivityShell(format, 'Tell Me More', 'Biologics', `
      <div class="learning-activity-icon" aria-hidden="true">🔎</div><p class="learning-lede">Biologics calm specific parts of the immune system involved in inflammation.</p>
      <p class="tell-more-prompt">That can be enough—or choose what you want to understand next.</p>
      <div class="tell-more-choices"><button type="button" data-tell-more="work">How do they work?</button><button type="button" data-tell-more="need">Why do I need them?</button><button type="button" data-tell-more="effects">What about side effects?</button><button type="button" data-tell-more="doctor">What should I ask my doctor?</button></div>
      <div class="learning-answer tell-more-answer" id="tell-more-answer" hidden aria-live="polite"></div>
      <a class="learning-source" href="https://www.crohnsandcolitis.org.uk/biologics" target="_blank" rel="noreferrer">Read more from Crohn’s &amp; Colitis UK ↗</a>`);
    return;
  }
  if (format === 'quick-read') {
    learningActivityShell(format, 'Quick Read · 60 sec', 'Quiet IBD, real tiredness', `
      <div class="learning-activity-icon" aria-hidden="true">📖</div><p class="learning-lede">You can feel tired even when your Crohn’s symptoms seem quiet. That tiredness is real.</p>
      <div class="micro-read"><p>Fatigue can have more than one cause. Ongoing inflammation, low iron or other nutrients, interrupted sleep, eating less, medicines and emotional strain can all play a part.</p><p>Feeling well also does not always tell the whole story about inflammation. Your care team uses your symptoms together with tests and your health history.</p></div>
      <aside class="learning-takeaway"><strong>One useful next step</strong><span>Keep a note of when tiredness happens and mention it to your IBD team—especially if it is new, persistent or affecting daily life.</span></aside><button class="discovery-button" type="button" data-learning-discovery="fatigue">That makes sense</button>
      <a class="learning-source" href="https://www.crohnsandcolitis.org.uk/info-support/information-about-crohns-and-colitis/all-information-about-crohns-and-colitis/symptoms/fatigue" target="_blank" rel="noreferrer">Read more from Crohn’s &amp; Colitis UK ↗</a>`);
    return;
  }
  if (format === 'tap-reveal') {
    learningActivityShell(format, 'Tap to Reveal', 'Can stress cause an IBD flare?', `
      <div class="learning-activity-icon" aria-hidden="true">👆</div><p class="learning-lede">What do you think?</p><button class="reveal-card" type="button" data-reveal-answer><span>Tap to find out</span><b aria-hidden="true">?</b></button><div class="learning-answer" id="learning-reveal-answer" hidden><strong>It’s connected—but it is not your fault.</strong><p>Stress can affect symptoms such as pain, urgency, tiredness and sleep. Research is still exploring exactly how stress and inflammation interact. A flare is never a personal failure.</p></div>`);
    return;
  }
  if (format === 'myth-fact') {
    learningActivityShell(format, 'Myth or Fact', 'If I feel well, inflammation must be gone.', `
      <div class="learning-activity-icon" aria-hidden="true">🧠</div><p class="learning-lede">Choose your answer:</p><div class="learning-choice-row"><button type="button" data-myth-choice="myth">Myth</button><button type="button" data-myth-choice="fact">Fact</button></div><div class="learning-answer" id="learning-myth-answer" hidden aria-live="polite"></div>`);
    return;
  }
  if (format === 'scenario') {
    learningActivityShell(format, 'What Would You Do?', 'Food plans with friends', `
      <div class="learning-activity-icon" aria-hidden="true">🎭</div><p class="learning-lede">You’re going out with friends and you’re worried about food. What could you do?</p><div class="scenario-choices"><button type="button" data-scenario-choice="plan">Check the menu and choose a backup before you go</button><button type="button" data-scenario-choice="talk">Tell one trusted friend what would help</button><button type="button" data-scenario-choice="skip">Skip the whole plan without telling anyone</button></div><div class="learning-answer" id="learning-scenario-answer" hidden aria-live="polite"></div>`);
    return;
  }
  learningActivityShell('one-thing', 'One Thing to Try', 'Your life is bigger than IBD', `
    <div class="learning-activity-icon" aria-hidden="true">💭</div><blockquote>“Your disease is part of your life, not your whole life.”</blockquote><label class="reflection-prompt" for="learning-reflection">Name one thing you enjoyed today that had nothing to do with IBD.</label><textarea id="learning-reflection" rows="4" placeholder="I enjoyed…"></textarea><button class="reflection-done" type="button" data-reflection-done>Done for today</button><p class="reflection-response" id="reflection-response" hidden aria-live="polite">That moment belongs to you. ✨</p>`);
}

const learningPathCopy = Object.freeze({
  ibd: 'Crohn’s and UC, remission, inflammation, tests and medicines.',
  body: 'Fatigue, poo, pain, appetite and sleep—understanding what your body tells you.',
  living: 'School or work, eating out, travelling, relationships and awkward moments.',
  mind: 'Worry, acceptance, difficult days, resilience and living in the present.',
  speak: 'Describing symptoms, preparing questions and making decisions with your care team.'
});

const learningDiscoveryCopy = Object.freeze({
  biologics: 'Biologics target specific parts of the immune response; each medicine can work differently.',
  fatigue: 'Tiredness can have several causes, even when IBD symptoms seem quiet.',
  stress: 'Stress can affect symptoms, but a flare is never a personal failure.',
  inflammation: 'Feeling better and having controlled inflammation are not always the same thing.',
  planning: 'A small plan or one trusted person can make social situations feel more manageable.',
  joy: 'Your life contains moments that belong to you—not to IBD.'
});
const completedLearningDiscoveries = new Set();

function showLearningDiscovery(key) {
  const activity = destinationContent.querySelector('.learning-activity');
  if (!activity || !learningDiscoveryCopy[key]) return;
  const earnedXp = awardParticipationXp(`learning:${key}`, 5, 'Discovery found');
  completedLearningDiscoveries.add(key);
  activity.querySelector('.now-you-know')?.remove();
  const discovery = document.createElement('aside');
  discovery.className = 'now-you-know';
  discovery.innerHTML = `<small>🌱 NOW YOU KNOW</small><strong>${learningDiscoveryCopy[key]}</strong><span>${earnedXp ? '+1 discovery · +5 XP' : 'Discovery revisited · XP already earned'}</span>`;
  activity.append(discovery);
}

const communityChampions = Object.freeze([
  { name: 'Amina', detail: 'Food ideas · school life', initials: 'AM' },
  { name: 'Leo', detail: 'Sports · staying active', initials: 'LE' },
  { name: 'Maya', detail: 'Newly diagnosed · art', initials: 'MY' },
  { name: 'Noah', detail: 'Medicine routines · gaming', initials: 'NO' }
]);

const championStrengths = Object.freeze([
  { name: 'Murmurak the Steadfast', category: 'resiliency', categoryLabel: 'Resiliency', trait: 'Staying grounded during difficult days', image: './public/Mumurak.png?v=306d1e7', unlocked: true },
  { name: 'Pebblit the Scholar', category: 'literacy', categoryLabel: 'Competency & Literacy', trait: 'Learning about IBD and asking questions' },
  { name: 'Fluffern the Consistent', category: 'habits', categoryLabel: 'Building Good Habits', trait: 'Maintaining small, achievable daily habits' },
  { name: 'Drizzlepaw the Rebounder', category: 'resiliency', categoryLabel: 'Resiliency', trait: 'Recovering after setbacks or flare-ups' },
  { name: 'Nibblen the Food Navigator', category: 'literacy', categoryLabel: 'Competency & Literacy', trait: 'Exploring food logging through trial and reflection' },
  { name: 'Emberoo the Unshaken', category: 'resiliency', categoryLabel: 'Resiliency', trait: 'Remaining courageous under pressure' },
  { name: 'Mossling the Carekeeper', category: 'habits', categoryLabel: 'Building Good Habits', trait: 'Practising regular self-care' },
  { name: 'Tidefin the Skillstream', category: 'literacy', categoryLabel: 'Competency & Literacy', trait: 'Developing practical IBD-management skills' },
  { name: 'Voltusk the Routine Charger', category: 'habits', categoryLabel: 'Building Good Habits', trait: 'Building momentum through routines' },
  { name: 'Cloudfinch the Brightmind', category: 'literacy', categoryLabel: 'Competency & Literacy', trait: 'Understanding information clearly' },
  { name: 'Grimbleaf the Enduring', category: 'resiliency', categoryLabel: 'Resiliency', trait: 'Continuing through uncertainty and discomfort' },
  { name: 'Crysthorn the Resolute', category: 'resiliency', categoryLabel: 'Resiliency', trait: 'Strength, determination and resolve' },
  { name: 'Venomurk the Analyst', category: 'literacy', categoryLabel: 'Competency & Literacy', trait: 'Recognising symptoms and patterns', image: './heard-20-monsters-standalone-png/venomurk-the-analyst.png', unlocked: true },
  { name: 'Ironclaw the Strategist', category: 'literacy', categoryLabel: 'Competency & Literacy', trait: 'Planning and making informed decisions' },
  { name: 'Lunamoth the Rhythmkeeper', category: 'habits', categoryLabel: 'Building Good Habits', trait: 'Maintaining healthy sleep and wellness rhythms' },
  { name: 'Bramblehorn the Persevering', category: 'resiliency', categoryLabel: 'Resiliency', trait: 'Persevering through long-term challenges' },
  { name: 'Abyssaur the Ritual Keeper', category: 'habits', categoryLabel: 'Building Good Habits', trait: 'Following helpful treatment and wellness rituals' },
  { name: 'Solgryn the Daystarter', category: 'habits', categoryLabel: 'Building Good Habits', trait: 'Beginning each day with positive routines' },
  { name: 'Gravemaw the Unbroken', category: 'resiliency', categoryLabel: 'Resiliency', trait: 'Inner strength during major challenges' },
  { name: 'Elythera the Wisdomweaver', category: 'literacy', categoryLabel: 'Competency & Literacy', trait: 'Connecting knowledge, experience and reflection' }
]);

function renderCommunityHome() {
  destinationKicker.textContent = 'YOU’RE NOT ALONE';
  destinationTitle.textContent = 'Community';
  destinationContent.innerHTML = `
    <section class="community-hero">
      <img class="community-hero-icon" src="./public/Community Icon.png" alt="" />
      <div><small>EVAN’S COLLECTION</small><h3>Champion’s Strengths</h3><p>Meet the strength pets you’ve unlocked along your journey.</p></div>
      <button class="strengths-open" id="strengths-open" type="button"><span>View collection <small>+2 XP</small></span><b aria-hidden="true">›</b></button>
    </section>

    <section class="community-section" aria-labelledby="champion-search-title">
      <div class="community-section-heading"><span class="community-heading-icon" aria-hidden="true">⌕</span><div><small>FIND YOUR PEOPLE</small><h3 id="champion-search-title">Find IBD Champions</h3></div></div>
      <form class="champion-search" id="champion-search" role="search">
        <label class="sr-only" for="champion-search-input">Search IBD Champions</label>
        <input id="champion-search-input" type="search" autocomplete="off" placeholder="Search by Champion name or interest" />
        <button type="submit">Search</button>
      </form>
      <p class="community-search-note">Only Champions who choose to be discoverable appear here. <strong>Explore once today · +2 XP</strong></p>
      <div class="champion-results" id="champion-results" aria-live="polite"></div>
    </section>

    <section class="community-section community-events" aria-labelledby="community-events-title">
      <div class="community-section-heading"><span class="community-heading-icon" aria-hidden="true">✦</span><div><small>COMING UP</small><h3 id="community-events-title">CCSS Talks &amp; Events</h3></div></div>
      <article class="event-card"><time datetime="2026-10-10"><strong>10</strong><span>OCT</span></time><div><span class="event-type">ONLINE TALK</span><span class="event-xp">+3 XP</span><h4>Food, flares and finding balance</h4><p>Ask an IBD dietitian your everyday food questions.</p></div><button type="button" data-event="Food, flares and finding balance" aria-label="View Food, flares and finding balance">›</button></article>
      <article class="event-card"><time datetime="2026-10-24"><strong>24</strong><span>OCT</span></time><div><span class="event-type event-type--mint">CHAMPION MEET-UP</span><span class="event-xp">+3 XP</span><h4>Young Champions Hangout</h4><p>Games, stories and a relaxed space to meet others.</p></div><button type="button" data-event="Young Champions Hangout" aria-label="View Young Champions Hangout">›</button></article>
      <article class="event-card"><time datetime="2026-11-07"><strong>07</strong><span>NOV</span></time><div><span class="event-type">CCSS TALK</span><span class="event-xp">+3 XP</span><h4>Getting ready for clinic</h4><p>Build confidence asking questions at appointments.</p></div><button type="button" data-event="Getting ready for clinic" aria-label="View Getting ready for clinic">›</button></article>
    </section>`;
}

function renderChampionResults(query = '') {
  const results = destinationContent.querySelector('#champion-results');
  if (!results) return;
  const cleanQuery = query.trim().toLocaleLowerCase();
  if (!cleanQuery) {
    results.innerHTML = '<p class="champion-results-empty">Try a name or an interest such as “art” or “school”.</p>';
    return;
  }
  const matches = communityChampions.filter(({ name, detail }) => `${name} ${detail}`.toLocaleLowerCase().includes(cleanQuery));
  results.innerHTML = matches.length
    ? matches.map(({ name, detail, initials }) => `<article class="champion-result"><span aria-hidden="true">${initials}</span><div><strong>${name}</strong><small>${detail}</small></div><button type="button" data-connect="${name}">Say hello</button></article>`).join('')
    : '<p class="champion-results-empty">No matching Champions found. Try another name or interest.</p>';
}

function renderChampionStrengths() {
  const orderedPets = [...championStrengths].sort((first, second) => Number(Boolean(second.unlocked)) - Number(Boolean(first.unlocked)));
  const discoveredPets = orderedPets.filter((pet) => pet.unlocked).length;
  const petCards = orderedPets.map((pet) => pet.unlocked
    ? `<article class="monster-box monster-box--unlocked monster-box--${pet.category}" aria-label="Discovered pet: ${pet.name}. ${pet.trait}">
         <span class="monster-rarity">DISCOVERED</span>
         <img src="${pet.image}" alt="${pet.name}" />
         <div><strong>${pet.name}</strong><small>${pet.categoryLabel}</small></div>
       </article>`
    : `<div class="monster-box monster-box--locked monster-box--${pet.category}" aria-label="Locked pet: ${pet.name}. ${pet.categoryLabel}">
         <span>?</span><strong>${pet.name}</strong><small>${pet.categoryLabel}</small>
       </div>`).join('');
  destinationKicker.textContent = 'CHAMPION’S STRENGTHS';
  destinationTitle.textContent = 'Pet Collection';
  destinationContent.innerHTML = `
    <button class="community-inline-back" id="community-inline-back" type="button">‹ <span>Back to Community</span></button>
    <section class="strengths-intro"><small>${discoveredPets} OF ${orderedPets.length} DISCOVERED</small><h3>Your pet shelf</h3><p>Each pet celebrates a strength you’ve shown. Keep checking in and taking part to discover more.</p><div class="strength-legend"><span class="is-resiliency">● Resiliency</span><span class="is-literacy">● Competency &amp; Literacy</span><span class="is-habits">● Building Good Habits</span></div></section>
    <div class="monster-gondola" aria-label="Champion’s Strengths pet collection">
      <div class="gondola-sign"><span>EVAN’S</span><strong>CHAMPION’S STRENGTHS</strong></div>
      <div class="monster-shelf">${petCards}</div>
      <div class="gondola-base" aria-hidden="true"></div>
    </div>`;
}

function closeDestination() {
  destinationPage.classList.remove('is-open');
  destinationPage.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => { destinationPage.hidden = true; }, 280);
}

communityButton.addEventListener('click', () => openDestination('community'));
learnButton.addEventListener('click', () => openDestination('learning'));
destinationBack.addEventListener('click', closeDestination);
destinationContent.addEventListener('submit', (event) => {
  if (event.target.id !== 'champion-search') return;
  event.preventDefault();
  const searchInput = event.target.querySelector('#champion-search-input');
  renderChampionResults(searchInput?.value || '');
  if (searchInput?.value.trim()) awardParticipationXp('community:search', 2, 'Community explored');
});
destinationContent.addEventListener('click', (event) => {
  const learningPath = event.target.closest('[data-learning-path]');
  if (learningPath) {
    destinationContent.querySelectorAll('[data-learning-path]').forEach((button) => button.classList.toggle('is-selected', button === learningPath));
    const pathCopy = destinationContent.querySelector('#learning-path-copy');
    if (pathCopy) pathCopy.textContent = learningPathCopy[learningPath.dataset.learningPath] || '';
    return;
  }
  const learningFormat = event.target.closest('[data-learning-format]');
  if (learningFormat) {
    openLearningFormat(learningFormat.dataset.learningFormat);
    return;
  }
  if (event.target.closest('[data-learning-back]')) {
    renderLearningHome();
    destinationContent.scrollTop = 0;
    return;
  }
  const revealButton = event.target.closest('[data-reveal-answer]');
  if (revealButton) {
    const answer = destinationContent.querySelector('#learning-reveal-answer');
    answer.hidden = false;
    revealButton.hidden = true;
    showLearningDiscovery('stress');
    return;
  }
  const tellMoreButton = event.target.closest('[data-tell-more]');
  if (tellMoreButton) {
    const tellMoreAnswers = {
      work: ['How they work', 'Different biologics target different proteins or pathways involved in inflammation. The exact target depends on the medicine.'],
      need: ['Why they may be offered', 'Biologics can help control symptoms and inflammation and support remission. Why one is being suggested for you depends on your IBD, previous treatment and what matters to you.'],
      effects: ['Side effects and monitoring', 'Side effects vary by medicine. Your team checks that treatment is suitable, explains important signs to notice and arranges any monitoring you need. Tell them about side effects or signs of infection.'],
      doctor: ['Questions you can take with you', 'What is the goal? How will I take it? When might it start working? What checks will I need? Who should I contact about side effects or a missed dose?']
    };
    const [heading, copy] = tellMoreAnswers[tellMoreButton.dataset.tellMore];
    destinationContent.querySelectorAll('[data-tell-more]').forEach((button) => button.classList.toggle('is-selected', button === tellMoreButton));
    const answer = destinationContent.querySelector('#tell-more-answer');
    answer.innerHTML = `<strong>${heading}</strong><p>${copy}</p>`;
    answer.hidden = false;
    showLearningDiscovery('biologics');
    return;
  }
  const discoveryButton = event.target.closest('[data-learning-discovery]');
  if (discoveryButton) {
    showLearningDiscovery(discoveryButton.dataset.learningDiscovery);
    discoveryButton.disabled = true;
    discoveryButton.textContent = 'Discovered ✓';
    return;
  }
  const mythChoice = event.target.closest('[data-myth-choice]');
  if (mythChoice) {
    const answer = destinationContent.querySelector('#learning-myth-answer');
    destinationContent.querySelectorAll('[data-myth-choice]').forEach((button) => button.classList.toggle('is-selected', button === mythChoice));
    answer.innerHTML = mythChoice.dataset.mythChoice === 'myth'
      ? '<strong>Myth.</strong><p>Some people have inflammation without obvious symptoms. Your care team looks at symptoms, tests and your health history together.</p>'
      : '<strong>It’s a myth.</strong><p>Feeling well is good, but it does not always confirm that inflammation has gone. That is why check-ups and tests still matter.</p>';
    answer.hidden = false;
    showLearningDiscovery('inflammation');
    return;
  }
  const scenarioChoice = event.target.closest('[data-scenario-choice]');
  if (scenarioChoice) {
    const scenarioAnswers = {
      plan: ['A practical plan', 'Checking ahead can reduce uncertainty. A familiar backup snack or meal can also make the outing feel easier.'],
      talk: ['Support can make space', 'Telling one trusted friend gives them a simple way to help without making IBD the focus of the day.'],
      skip: ['Your choice matters', 'You can choose not to go, but you do not have to face the worry alone. A small plan or a trusted friend may keep more options open.']
    };
    const [heading, copy] = scenarioAnswers[scenarioChoice.dataset.scenarioChoice];
    destinationContent.querySelectorAll('[data-scenario-choice]').forEach((button) => button.classList.toggle('is-selected', button === scenarioChoice));
    const answer = destinationContent.querySelector('#learning-scenario-answer');
    answer.innerHTML = `<strong>${heading}</strong><p>${copy}</p>`;
    answer.hidden = false;
    showLearningDiscovery('planning');
    return;
  }
  if (event.target.closest('[data-reflection-done]')) {
    const reflection = destinationContent.querySelector('#learning-reflection');
    const response = destinationContent.querySelector('#reflection-response');
    response.textContent = reflection.value.trim() ? 'That moment belongs to you. ✨' : 'You can come back when something comes to mind.';
    response.hidden = false;
    if (reflection.value.trim()) showLearningDiscovery('joy');
    return;
  }
  if (event.target.closest('#strengths-open')) {
    awardParticipationXp('community:strengths', 2, 'Strength collection explored');
    renderChampionStrengths();
    destinationContent.scrollTop = 0;
    return;
  }
  if (event.target.closest('#community-inline-back')) {
    renderCommunityHome();
    destinationContent.scrollTop = 0;
    return;
  }
  const connectButton = event.target.closest('[data-connect]');
  if (connectButton) {
    showToast(`Hello request ready for ${connectButton.dataset.connect}`);
    return;
  }
  const eventButton = event.target.closest('[data-event]');
  if (eventButton) {
    const earned = awardParticipationXp(`community:event:${eventButton.dataset.event}`, 3);
    showToast(`${eventButton.dataset.event} · details coming soon${earned ? ' · +3 XP' : ''}`);
  }
});

/* ---------- Secret blind-box unlock ---------- */
let unlockCloseTimer = null;
let capsuleReveal = null;
let unlockReturnFocus = null;
const capsuleAssets = Object.freeze({
  capsuleClosed: './public/capsule-reveal/capsule-closed.webp',
  capsuleLeft: './public/capsule-reveal/capsule-left.webp',
  capsuleRight: './public/capsule-reveal/capsule-right.webp',
  capsuleGlow: './public/capsule-reveal/capsule-glow.webp',
  fluffern: './public/capsule-reveal/fluffern.webp'
});

function chooseUnlockPet() {
  return 'fluffern';
}

function openSecretUnlock() {
  window.clearTimeout(unlockCloseTimer);
  unlockReturnFocus = document.activeElement;
  capsuleReveal?.destroy();
  unlockReveal.replaceChildren();
  unlockOverlay.hidden = false;
  unlockOverlay.setAttribute('aria-hidden', 'false');
  window.requestAnimationFrame(() => unlockOverlay.classList.add('is-open'));
  if (!window.HeardCapsuleReveal) {
    closeSecretUnlock();
    showToast('The unlock animation could not play');
    return;
  }
  capsuleReveal = window.HeardCapsuleReveal.play(unlockReveal, {
    monster: chooseUnlockPet(),
    assets: capsuleAssets,
    autoOpen: false,
    background: false,
    showInfo: true,
    holdMs: 5500,
    onDone: closeSecretUnlock
  });
  unlockSkip.focus();
  unlockCloseTimer = window.setTimeout(() => unlockReveal.querySelector('.hcr-cap')?.focus(), 1050);
}

function closeSecretUnlock() {
  window.clearTimeout(unlockCloseTimer);
  capsuleReveal?.destroy();
  capsuleReveal = null;
  unlockOverlay.classList.remove('is-open');
  unlockOverlay.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    unlockOverlay.hidden = true;
    unlockReveal.replaceChildren();
    if (unlockReturnFocus instanceof HTMLElement && unlockReturnFocus.isConnected) unlockReturnFocus.focus();
  }, 200);
}

unlockSkip.addEventListener('click', closeSecretUnlock);
document.addEventListener('keydown', (event) => {
  if (event.altKey && event.shiftKey && event.code === 'KeyB') {
    event.preventDefault();
    openSecretUnlock();
  } else if (event.key === 'Escape' && !unlockOverlay.hidden) {
    closeSecretUnlock();
  } else if (event.key === 'Escape' && !destinationPage.hidden) {
    closeDestination();
  }
});

/* ---------- Resizable chat history ---------- */
function chatResizeBounds() {
  const viewRect = views.chat.getBoundingClientRect();
  const composerRect = chatForm.getBoundingClientRect();
  const minimum = 12;
  const maximum = Math.max(minimum, composerRect.top - viewRect.top - 150);
  return { viewRect, minimum, maximum };
}

function setChatHistoryTop(value, persist = false) {
  const { viewRect, minimum, maximum } = chatResizeBounds();
  if (!viewRect.height) return;
  chatHistoryTop = Math.min(maximum, Math.max(minimum, value));
  chatTopRatio = chatHistoryTop / viewRect.height;
  views.chat.style.setProperty('--chat-history-top', `${chatHistoryTop}px`);
  // Clip room controls at the drawer edge. This keeps the room itself visible
  // through the chat while XP and Journal controls pass behind the drawer.
  const appRect = appShell.getBoundingClientRect();
  const widgetCutoff = viewRect.top - appRect.top + chatHistoryTop;
  appShell.style.setProperty('--chat-widget-cutoff', `${widgetCutoff}px`);
  const expanded = Math.round(((maximum - chatHistoryTop) / Math.max(1, maximum - minimum)) * 100);
  chatResizeHandle.setAttribute('aria-valuenow', String(expanded));
  chatResizeHandle.setAttribute('aria-valuetext', `${expanded}% expanded`);
  if (persist) {
    try { localStorage.setItem('heard-chat-top-ratio', String(chatTopRatio)); } catch { /* Keep the size for this session. */ }
  }
}

function restoreChatHistorySize() {
  let saved = NaN;
  try { saved = Number(localStorage.getItem('heard-chat-top-ratio')); } catch { saved = NaN; }
  const ratio = Number.isFinite(saved) && saved > 0 && saved < 1 ? saved : 0.38;
  const rect = views.chat.getBoundingClientRect();
  setChatHistoryTop(rect.height * ratio);
}

chatResizeHandle.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  chatResizeHandle.setPointerCapture(event.pointerId);
  chatResizeHandle.classList.add('is-dragging');
  event.preventDefault();
});

chatResizeHandle.addEventListener('pointermove', (event) => {
  if (!chatResizeHandle.hasPointerCapture(event.pointerId)) return;
  const { viewRect } = chatResizeBounds();
  setChatHistoryTop(event.clientY - viewRect.top);
});

function finishChatResize(event) {
  if (!chatResizeHandle.hasPointerCapture(event.pointerId)) return;
  chatResizeHandle.releasePointerCapture(event.pointerId);
  chatResizeHandle.classList.remove('is-dragging');
  setChatHistoryTop(chatHistoryTop, true);
}

chatResizeHandle.addEventListener('pointerup', finishChatResize);
chatResizeHandle.addEventListener('pointercancel', finishChatResize);
chatResizeHandle.addEventListener('dblclick', () => {
  const rect = views.chat.getBoundingClientRect();
  setChatHistoryTop(rect.height * 0.38, true);
});
chatResizeHandle.addEventListener('keydown', (event) => {
  if (!['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
  event.preventDefault();
  const { minimum, maximum } = chatResizeBounds();
  const next = event.key === 'ArrowUp' ? chatHistoryTop - 24 : event.key === 'ArrowDown' ? chatHistoryTop + 24 : event.key === 'Home' ? minimum : maximum;
  setChatHistoryTop(next, true);
});

window.addEventListener('resize', restoreChatHistorySize);

/* ---------- Message creation ---------- */
function createUserMessage(text, attachment = null) {
  const article = document.createElement('article');
  article.className = 'message message--user';

  const content = document.createElement('div');
  content.className = 'message-content';

  const bubble = document.createElement('div');
  bubble.className = 'bubble bubble--user';

  if (attachment) {
    bubble.classList.add('has-media');
    const mediaUrl = URL.createObjectURL(attachment.file);

    if (attachment.kind === 'photo') {
      const image = document.createElement('img');
      image.className = 'chat-photo';
      image.src = mediaUrl;
      image.alt = attachment.file.name || 'Photo sent to Evan';
      bubble.append(image);
    } else {
      const audio = document.createElement('audio');
      audio.className = 'chat-audio';
      audio.src = mediaUrl;
      audio.controls = true;
      audio.preload = 'metadata';
      audio.setAttribute('aria-label', 'Voice note');
      bubble.append(audio);
    }
  }

  if (text) {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    bubble.append(paragraph);
  }

  const time = document.createElement('time');
  time.dateTime = new Date().toISOString();
  time.textContent = formatTime();

  const avatar = document.createElement('div');
  avatar.className = 'avatar avatar--message-user';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = '👦🏻';

  content.append(bubble, time);
  article.append(content, avatar);
  return article;
}

function appendInlineMarkdown(container, text) {
  const segments = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);

  segments.forEach((segment) => {
    const isBold = (/^\*\*[^*]+\*\*$/.test(segment) || /^\*[^*]+\*$/.test(segment));
    if (!isBold) {
      container.append(document.createTextNode(segment));
      return;
    }

    const strong = document.createElement('strong');
    strong.textContent = segment.replace(/^\*{1,2}|\*{1,2}$/g, '');
    container.append(strong);
  });
}

function renderMarkdown(container, markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').trim().split('\n');
  let paragraph = null;
  let list = null;

  lines.forEach((line) => {
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    const listItem = line.match(/^\s*[-*]\s+(.+)$/);

    if (headingMatch) {
      paragraph = null;
      list = null;
      const heading = document.createElement('h3');
      appendInlineMarkdown(heading, headingMatch[1]);
      container.append(heading);
      return;
    }

    if (listItem) {
      paragraph = null;
      if (!list) {
        list = document.createElement('ul');
        container.append(list);
      }
      const item = document.createElement('li');
      appendInlineMarkdown(item, listItem[1]);
      list.append(item);
      return;
    }

    list = null;
    if (!line.trim()) {
      paragraph = null;
      return;
    }

    if (!paragraph) {
      paragraph = document.createElement('p');
      container.append(paragraph);
    } else {
      paragraph.append(document.createElement('br'));
    }
    appendInlineMarkdown(paragraph, line);
  });
}

function sanitizeHeardResponse(text) {
  return String(text)
    .split(/\r?\n/)
    .filter((line) => !/^\s*tools called\s*:/i.test(line))
    .join('\n')
    .replace(/consider consulting a healthcare professional if this persists\.?/gi, '')
    .trim();
}

function createCompanionMessage(text = '', options = {}) {
  const article = document.createElement('article');
  article.className = 'message message--companion';

  const avatar = document.createElement('div');
  avatar.className = 'avatar avatar--bot';
  avatar.setAttribute('aria-hidden', 'true');
  const avatarImage = document.createElement('img');
  avatarImage.src = './public/heard-chat-robot.png';
  avatarImage.alt = '';
  avatar.append(avatarImage);

  const content = document.createElement('div');
  content.className = 'message-content';

  const bubble = document.createElement('div');
  bubble.className = `bubble bubble--companion${options.error ? ' bubble--error' : ''}`;

  const name = document.createElement('strong');
  name.textContent = 'HEARD';
  bubble.append(name);

  if (options.loading) {
    const thinking = document.createElement('div');
    thinking.className = 'thinking-dots';
    thinking.setAttribute('role', 'status');
    thinking.setAttribute('aria-label', 'HEARD is thinking');
    thinking.innerHTML = '<span></span><span></span><span></span>';
    bubble.append(thinking);
  } else {
    const response = document.createElement('div');
    response.className = 'markdown-response';
    renderMarkdown(response, text);
    bubble.append(response);
  }

  if (options.chips?.length) {
    const chipList = document.createElement('div');
    chipList.className = 'chat-chips';
    options.chips.forEach((chip) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = chip.label;
      button.addEventListener('click', () => {
        chipList.querySelectorAll('button').forEach((item) => { item.disabled = true; });
        options.onChip(chip);
      }, { once: true });
      chipList.append(button);
    });
    bubble.append(chipList);
  }

  const time = document.createElement('time');
  time.dateTime = new Date().toISOString();
  time.textContent = formatTime();

  content.append(bubble, time);
  article.append(avatar, content);
  return article;
}

function replaceThinkingMessage(article, text, isError = false) {
  const oldBubble = article.querySelector('.bubble');
  const newMessage = createCompanionMessage(text, { error: isError });
  oldBubble.replaceWith(newMessage.querySelector('.bubble'));
  article.querySelector('time').textContent = formatTime();
  scrollChatToLatest();
}

async function requestCompanionReply(patientRecord, conversationText, attachment = null) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), attachment ? 60000 : 30000);

  try {
    let headers;
    let body;

    if (attachment) {
      body = new FormData();
      body.append('patient_record', patientRecord);
      body.append('conversation_text', conversationText);
      body.append('response_by', chatResponseBy);
      body.append(attachment.uploadField, attachment.file, attachment.file.name);
      headers = { Accept: 'application/json' };
    } else {
      headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      };
      body = JSON.stringify({
        patient_record: patientRecord,
        conversation_text: conversationText,
        response_by: chatResponseBy
      });
    }

    const response = await fetch(chatEndpoint, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal
    });

    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const requestError = new Error(`Request failed with status ${response.status}`);
      if (data?.patient_record) {
        requestError.userMessage = 'The backend rejected the saved User ID. Please check that the full UUID is correct.';
      } else if (data?.response_by) {
        requestError.userMessage = 'The chat service rejected the message type. Please contact support.';
      } else if (attachment && data?.[attachment.uploadField]) {
        requestError.userMessage = `The chat service could not accept this ${attachment.kind}. Please try another file.`;
      }
      throw requestError;
    }

    if (!data || typeof data.ai_response !== 'string') throw new Error('Invalid response from chat service');
    return sanitizeHeardResponse(data.ai_response);
  } finally {
    window.clearTimeout(timeout);
  }
}

function getSavedPatientRecord() {
  const patientRecord = cleanPatientRecord(patientIdInput?.value || savedPatientId);

  if (!patientRecord) {
    messages.append(createCompanionMessage('Please enter your clinic Champion ID in the IBD Champion profile first.', { error: true }));
    scrollChatToLatest();
    showToast('Enter your Champion ID first');
    setMenu(true);
    return null;
  }

  if (!isValidPatientRecord(patientRecord)) {
    messages.append(createCompanionMessage('The Champion ID is incomplete or invalid. Please enter the complete 36-character UUID.', { error: true }));
    scrollChatToLatest();
    showToast('Enter a valid Champion ID');
    setMenu(true);
    return null;
  }

  savedPatientId = patientRecord;
  patientIdInput.value = patientRecord;
  try {
    const cached = JSON.parse(localStorage.getItem(patientStorageKey)) || {};
    localStorage.setItem(patientStorageKey, JSON.stringify({ ...cached, patientId: patientRecord }));
  } catch {
    // The ID remains available for the current session if storage is unavailable.
  }
  return patientRecord;
}

function setChatPending(pending) {
  chatForm.dataset.pending = pending ? 'true' : '';
  chatForm.toggleAttribute('aria-busy', pending);
  sendButton.disabled = pending;
  photoButton.disabled = pending;
  voiceButton.disabled = pending;
  flareButton.disabled = pending;
}

async function sendChatContent(text, attachment = null) {
  if (chatForm.dataset.pending === 'true') return;
  const patientRecord = getSavedPatientRecord();
  if (!patientRecord) return;

  const conversationText = text || (attachment?.kind === 'photo' ? foodImageConversationText : 'Voice note');

  messages.append(createUserMessage(text, attachment));
  messageInput.value = '';
  scrollChatToLatest();

  const thinkingMessage = createCompanionMessage('', { loading: true });
  messages.append(thinkingMessage);
  scrollChatToLatest();
  setChatPending(true);

  try {
    const reply = await requestCompanionReply(patientRecord, conversationText, attachment);
    replaceThinkingMessage(thinkingMessage, reply);
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'The response is taking longer than expected. Please try again.'
      : error.userMessage || 'I couldn’t connect right now. Please check your connection and try again.';
    replaceThinkingMessage(thinkingMessage, message, true);
  } finally {
    setChatPending(false);
    messageInput.focus();
  }
}

/* Symptom messages become structured journal prompts, never diagnoses. */
let structuredChat = null;

function detectStructuredSteps(text) {
  const lower = text.toLowerCase();
  const steps = [];
  const hasBlood = /\bblood|bleed|bleeding/.test(lower);
  const hasEnergy = /\btired|fatigue|fatigued|exhausted|low energy/.test(lower);
  const hasSleep = /\bsleep|slept|woke|awake at night/.test(lower);
  const hasToilet = /toilet|bowel movement|going a lot|times today|pooing/.test(lower);
  const hasPain = /\bpain|hurt|hurting|ache|cramp/.test(lower);

  if (hasBlood) steps.push({
    key: 'blood', question: 'Was the blood streaks, mixed in, or mostly blood?',
    chips: [['Streaks', 'small_streaks'], ['Mixed in', 'mixed'], ['Mostly blood', 'mostly']]
  });
  if (hasEnergy) steps.push({
    key: 'energy', question: 'And your energy today?',
    chips: [['Low', 'low'], ['OK', 'ok'], ['Good', 'good']]
  });
  if (hasEnergy || hasSleep) steps.push({
    key: 'sleep', question: 'How did you sleep?',
    chips: [['Bad', 'bad'], ['OK', 'ok'], ['Good', 'good']]
  });
  if (hasToilet) {
    steps.push({
      key: 'toilet_trips', question: 'How many times have you gone today?',
      chips: ['1', '2', '3', '4', '5', '6', '7', '8+'].map((value) => [value, value === '8+' ? 8 : Number(value)])
    });
    steps.push({
      key: 'woke_to_go', question: 'Did you have to go during the night?',
      chips: [['No', 0], ['Once', 1], ['Twice', 2], ['3+', 3]]
    });
  }
  if (hasPain) {
    steps.push({
      key: 'pain_score', question: 'How strong is the pain from 0 to 10?',
      chips: Array.from({ length: 11 }, (_, value) => [String(value), value])
    });
    steps.push({
      key: 'pain_location', question: 'Where is the pain?',
      chips: [['Lower left', 'lower left'], ['Lower right', 'lower right'], ['All over', 'all over'], ['Other', 'other']]
    });
    steps.push({
      key: 'pain_timing', question: 'When does it happen?',
      chips: [['After eating', 'after eating'], ['Before going', 'before going'], ['Woke me', 'woke me'], ['Other', 'other']]
    });
  }
  return steps;
}

function chatEntry(type, value) {
  const entry = addJournalEntry(type, value, {
    source: 'chat',
    raw_text: structuredChat.rawText
  });
  structuredChat.entries.push(entry);
  return entry;
}

function recordStructuredAnswer(step, value) {
  structuredChat.answers[step.key] = value;
  if (['blood', 'energy', 'sleep', 'toilet_trips'].includes(step.key)) chatEntry(step.key, value);

  if (step.key === 'woke_to_go') {
    const sleepEntry = structuredChat.entries.find((entry) => entry.type === 'sleep');
    if (sleepEntry) sleepEntry.value = { quality: sleepEntry.value, woke_to_go: value };
    else chatEntry('sleep', { quality: null, woke_to_go: value });
    saveJournalEntries();
  }

  if (step.key === 'pain_timing') {
    chatEntry('pain', {
      score: structuredChat.answers.pain_score,
      location: structuredChat.answers.pain_location,
      timing: value
    });
  }
}

function lowEnergyDaysInLastFortnight() {
  const earliest = new Date();
  earliest.setDate(earliest.getDate() - (routingConfig.lowEnergyWindowDays - 1));
  const lowDays = new Set(journalEntries
    .filter((entry) => entry.type === 'energy' && entry.value === 'low' && new Date(`${entry.date}T12:00:00`) >= earliest)
    .map((entry) => entry.date));
  return lowDays.size;
}

function finishStructuredChat() {
  const answers = structuredChat.answers;
  const rawLower = structuredChat.rawText.toLowerCase();
  const logged = [...new Set(structuredChat.entries.map((entry) => entry.type.replace('_', ' ')))];
  const urgentTrigger = Boolean(answers.blood) && routingConfig.urgentPattern.test(rawLower);
  let reply = `Logged ${logged.join(' and ')}.`;

  if (routingConfig.bloodToNurse.includes(answers.blood)) {
    addJournalEntry('flare_report', { reason: `Blood ${answers.blood}`, routed_to: routingConfig.nurseName, reply_time: routingConfig.nurseReplyTime }, {
      source: 'chat', raw_text: structuredChat.rawText, ask_team: true
    });
    reply += ` Blood ${answers.blood === 'mixed' ? 'mixed in' : 'mostly blood'} goes to ${routingConfig.nurseName}; she’ll reply within ${routingConfig.nurseReplyTime}.`;
    if (urgentTrigger) {
      reply += ' Don’t wait — call the IBD line or go to A&E.';
    } else {
      reply += ' If you get a fever or can’t keep fluids down, don’t wait for her — call the IBD line.';
    }
  } else if (urgentTrigger) {
    addJournalEntry('flare_report', { reason: 'Blood with fever or fluids concern', routed_to: 'urgent IBD line' }, {
      source: 'chat', raw_text: structuredChat.rawText, ask_team: true
    });
    reply += ' Blood with a fever or trouble keeping fluids down is urgent — don’t wait; call the IBD line or go to A&E.';
  }

  if (answers.energy === 'low' && lowEnergyDaysInLastFortnight() >= routingConfig.lowEnergyDays) {
    reply += ` Low energy has been logged on at least ${routingConfig.lowEnergyDays} of the last ${routingConfig.lowEnergyWindowDays} days, so it is flagged for the doctor’s unsaid panel and handover card.`;
  }

  messages.append(createCompanionMessage(reply));
  structuredChat = null;
  saveJournalEntries();
  renderWeeklyTracker();
  if (document.querySelector('#journal-overlay')?.classList.contains('is-open')) renderCalendar();
  scrollChatToLatest();
}

function askStructuredQuestion() {
  const step = structuredChat.steps.shift();
  if (!step) {
    finishStructuredChat();
    return;
  }

  const chips = step.chips.map(([label, value]) => ({ label, value }));
  messages.append(createCompanionMessage(step.question, {
    chips,
    onChip: async (chip) => {
      const patientRecord = getSavedPatientRecord();
      if (!patientRecord) return;
      const sentence = structuredAnswerSentence(step, chip);
      messages.append(createUserMessage(sentence));
      const waiting = createCompanionMessage('', { loading: true });
      messages.append(waiting);
      scrollChatToLatest();
      setChatPending(true);
      try {
        const reply = await requestCompanionReply(patientRecord, sentence);
        replaceThinkingMessage(waiting, reply);
        recordStructuredAnswer(step, chip.value);
        askStructuredQuestion();
      } catch (error) {
        const message = error.name === 'AbortError'
          ? 'That is taking longer than expected. Please choose your answer again.'
          : error.userMessage || 'I couldn’t save that answer. Please choose it again.';
        replaceThinkingMessage(waiting, message, true);
        structuredChat.steps.unshift(step);
        askStructuredQuestion();
      } finally {
        setChatPending(false);
      }
    }
  }));
  scrollChatToLatest();
}

function structuredAnswerSentence(step, chip) {
  const value = chip.value;
  if (step.key === 'blood') return `I saw ${value === 'small_streaks' ? 'small streaks of blood' : value === 'mixed' ? 'blood mixed into my stool' : 'mostly blood'} when I went to the toilet.`;
  if (step.key === 'energy') return `My energy level today is ${value}.`;
  if (step.key === 'sleep') return `My sleep was ${value}.`;
  if (step.key === 'toilet_trips') return value >= 8 ? 'I went to the toilet 8 or more times today.' : `I went to the toilet ${value} ${value === 1 ? 'time' : 'times'} today.`;
  if (step.key === 'woke_to_go') return value === 0 ? 'I did not wake up to go to the toilet during the night.' : `I woke up to go to the toilet ${value === 1 ? 'once' : value === 2 ? 'twice' : '3 or more times'} during the night.`;
  if (step.key === 'pain_score') return `My pain is ${value} out of 10.`;
  if (step.key === 'pain_location') return `My pain is ${value === 'all over' ? 'all over my tummy' : `in my ${value}`}.`;
  if (step.key === 'pain_timing') return `My pain happens ${value}.`;
  return `My answer is ${chip.label}.`;
}

async function beginStructuredChat(text, steps) {
  const patientRecord = getSavedPatientRecord();
  if (!patientRecord) return;
  messages.append(createUserMessage(text));
  messageInput.value = '';
  structuredChat = { rawText: text, steps, answers: {}, entries: [] };
  const waiting = createCompanionMessage('', { loading: true });
  messages.append(waiting);
  scrollChatToLatest();
  setChatPending(true);
  try {
    const reply = await requestCompanionReply(patientRecord, text);
    replaceThinkingMessage(waiting, reply);
    askStructuredQuestion();
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'The response is taking longer than expected. Please try again.'
      : error.userMessage || 'I couldn’t connect right now. Please check your connection and try again.';
    replaceThinkingMessage(waiting, message, true);
    structuredChat = null;
  } finally {
    setChatPending(false);
  }
}

function startFlareReport() {
  if (pendingPhotoAttachment) {
    showToast('Send or remove the attached photo first');
    return;
  }
  if (structuredChat || chatForm.dataset.pending === 'true') {
    showToast('Finish the current message first');
    return;
  }
  if (!getSavedPatientRecord()) return;
  flareCaptureMode = true;
  flareButton.classList.add('is-active');
  flareButton.setAttribute('aria-pressed', 'true');
  messages.append(createCompanionMessage('Flare report started. Tell me what’s happening.'));
  scrollChatToLatest();
  messageInput.placeholder = 'Describe your flare…';
  messageInput.focus();
}

async function submitFlareReport(text) {
  const patientRecord = getSavedPatientRecord();
  if (!patientRecord) return;
  flareCaptureMode = false;
  flareButton.classList.remove('is-active');
  flareButton.setAttribute('aria-pressed', 'false');
  messageInput.placeholder = 'Message HEARD…';
  messages.append(createUserMessage(text));
  messageInput.value = '';
  addJournalEntry('flare_report', {
    reason: text,
    routed_to: routingConfig.nurseName,
    reply_time: routingConfig.nurseReplyTime,
    status: 'sent'
  }, { source: 'chat', raw_text: text, ask_team: true });
  const waiting = createCompanionMessage('', { loading: true });
  messages.append(waiting);
  scrollChatToLatest();
  setChatPending(true);
  try {
    // Keep the user's bubble natural while giving Django one complete,
    // explicit flare sentence followed by the information they entered.
    const reply = await requestCompanionReply(patientRecord, buildFlareConversationText(text));
    replaceThinkingMessage(waiting, reply);
  } catch {
    replaceThinkingMessage(waiting, `Saved in your journal, but I couldn’t send it to ${routingConfig.nurseName}. Please try again when you’re connected.`, true);
  } finally {
    setChatPending(false);
    renderWeeklyTracker();
  }
}

flareButton.addEventListener('click', startFlareReport);

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (speechRecognition) {
    showToast('Stop the voice note, review the transcript, then tap Send');
    return;
  }
  const text = messageInput.value.trim();

  if (!text) {
    messageInput.focus();
    showToast(pendingPhotoAttachment ? 'Add a question or note for this photo' : 'Type a message first');
    return;
  }

  if (flareCaptureMode) {
    submitFlareReport(text);
    return;
  }

  const attachment = pendingPhotoAttachment;
  if (attachment) clearPendingPhoto();
  sendChatContent(text, attachment);
});

photoButton.addEventListener('click', () => {
  if (speechRecognition) {
    showToast('Stop the voice note, review the transcript, then tap Send');
    return;
  }
  if (chatForm.dataset.pending === 'true' || !getSavedPatientRecord()) return;
  photoInput.click();
});

photoInput.addEventListener('change', () => {
  const file = photoInput.files?.[0];
  photoInput.value = '';
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Please choose an image file');
    return;
  }

  if (file.size > maxPhotoBytes) {
    showToast('Please choose an image smaller than 10 MB');
    return;
  }

  setPendingPhoto(file);
});

function clearPendingPhoto() {
  if (pendingPhotoPreviewUrl) URL.revokeObjectURL(pendingPhotoPreviewUrl);
  pendingPhotoPreviewUrl = '';
  pendingPhotoAttachment = null;
  photoDraftImage.removeAttribute('src');
  photoDraft.hidden = true;
  views.chat.classList.remove('has-photo-draft');
  photoButton.classList.remove('has-attachment');
  photoButton.setAttribute('aria-label', 'Attach a photo');
  if (!flareCaptureMode) messageInput.placeholder = 'Message HEARD…';
}

function setPendingPhoto(file) {
  clearPendingPhoto();
  pendingPhotoAttachment = { kind: 'photo', file, uploadField: photoUploadField };
  pendingPhotoPreviewUrl = URL.createObjectURL(file);
  photoDraftImage.src = pendingPhotoPreviewUrl;
  photoDraft.hidden = false;
  views.chat.classList.add('has-photo-draft');
  photoButton.classList.add('has-attachment');
  photoButton.setAttribute('aria-label', 'Change attached photo');
  messageInput.placeholder = 'Ask about this photo or describe the meal…';
  messageInput.focus();
  showToast('Photo attached · add a message, then tap Send');
}

photoDraftRemove.addEventListener('click', () => {
  clearPendingPhoto();
  messageInput.focus();
  showToast('Photo removed');
});

function resetVoiceRecorder() {
  window.clearTimeout(recordingTimer);
  recordingTimer = null;
  speechRecognition = null;
  voiceStartPending = false;
  voiceButton.classList.remove('is-recording');
  voiceButton.setAttribute('aria-pressed', 'false');
  voiceButton.setAttribute('aria-label', 'Record a voice note');
  messageInput.placeholder = flareCaptureMode
    ? 'Describe your flare…'
    : pendingPhotoAttachment
      ? 'Ask about this photo or describe the meal…'
      : 'Message HEARD…';
  const waitingForReply = chatForm.dataset.pending === 'true';
  sendButton.disabled = waitingForReply;
  photoButton.disabled = waitingForReply;
  voiceButton.disabled = waitingForReply;
}

function showMediaError(message) {
  messages.append(createCompanionMessage(message, { error: true }));
  scrollChatToLatest();
  showToast(message);
}

function normaliseVoiceTranscript(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function confirmMicrophoneAccess() {
  if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    const error = new Error('Voice transcription requires a secure connection.');
    error.code = 'insecure-context';
    throw error;
  }

  // SpeechRecognition requests its own permission, but an explicit microphone
  // check gives consistent permission behaviour and actionable errors on mobile.
  if (!navigator.mediaDevices?.getUserMedia) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  stream.getTracks().forEach((track) => track.stop());
}

function voiceErrorMessage(errorCode) {
  if (['not-allowed', 'service-not-allowed', 'permission-denied'].includes(errorCode)) {
    return 'Microphone access is blocked. Allow microphone access for this site, then try again.';
  }
  if (errorCode === 'audio-capture') {
    return 'No working microphone was found. Check your microphone and try again.';
  }
  if (errorCode === 'network') {
    return 'The browser’s speech service could not connect. Open HEARD directly in Chrome or Safari and try again.';
  }
  if (errorCode === 'language-not-supported') {
    return 'This browser could not transcribe the selected language. Try Chrome or Safari, or use your keyboard microphone.';
  }
  if (errorCode === 'insecure-context') {
    return 'Voice transcription only works on the secure HEARD site or localhost.';
  }
  if (errorCode === 'no-speech') {
    return 'I could not hear any words. Try again and speak after the microphone turns red.';
  }
  return 'The voice note could not be transcribed. Try again, or use the microphone on your phone keyboard.';
}

function finishVoiceTranscription() {
  const transcript = normaliseVoiceTranscript(voiceTranscript);
  const draft = normaliseVoiceTranscript(voiceDraftText);
  const recognitionError = voiceRecognitionError;
  resetVoiceRecorder();
  voiceTranscript = '';
  voiceFinalTranscript = '';
  voiceDraftText = '';
  voiceRecognitionError = '';

  // Keep any words already recognised even if the browser reports a late
  // network/audio error. A partial editable transcript is still useful.
  if (!transcript && recognitionError) {
    messageInput.value = draft;
    showMediaError(voiceErrorMessage(recognitionError));
    return;
  }

  if (!transcript) {
    messageInput.value = draft;
    showMediaError('I could not hear any words. Please try the voice note again.');
    return;
  }

  // Do not send automatically. The transcript stays in the normal composer
  // so the Champion can review or edit it before explicitly tapping Send.
  messageInput.value = normaliseVoiceTranscript(`${draft} ${transcript}`);
  messageInput.focus();
  messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);
  showToast('Transcript ready · review it, then tap Send');
}

async function startVoiceRecording() {
  if (pendingPhotoAttachment) {
    showToast('Send or remove the attached photo first');
    return;
  }
  if (voiceStartPending || chatForm.dataset.pending === 'true' || !getSavedPatientRecord()) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showMediaError('This browser does not support live transcription. Open HEARD directly in Chrome or Safari, or use your phone keyboard microphone.');
    return;
  }

  try {
    voiceStartPending = true;
    voiceButton.disabled = true;
    voiceButton.setAttribute('aria-label', 'Preparing microphone');
    showToast('Preparing microphone…');
    await confirmMicrophoneAccess();

    const recognition = new SpeechRecognition();
    speechRecognition = recognition;
    voiceStartPending = false;
    voiceTranscript = '';
    voiceFinalTranscript = '';
    voiceDraftText = messageInput.value;
    voiceRecognitionError = '';
    recognition.lang = navigator.language || 'en-SG';
    // A single utterance is substantially more reliable on Safari/iOS and
    // Chromium mobile. The browser finishes after a natural pause, leaving the
    // transcript in the composer for review before the user taps Send.
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.addEventListener('result', (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      // Rebuild from the full result list on every event. Chrome and Safari
      // advance resultIndex differently, so appending only the changed range
      // can duplicate words on one platform and lose them on another.
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const words = result[0]?.transcript || '';
        if (result.isFinal) finalTranscript = normaliseVoiceTranscript(`${finalTranscript} ${words}`);
        else interimTranscript = normaliseVoiceTranscript(`${interimTranscript} ${words}`);
      }
      voiceFinalTranscript = finalTranscript;
      voiceTranscript = normaliseVoiceTranscript(`${voiceFinalTranscript} ${interimTranscript}`);
      messageInput.value = normaliseVoiceTranscript(`${voiceDraftText} ${voiceTranscript}`);
    });

    recognition.addEventListener('nomatch', () => {
      voiceRecognitionError = 'no-speech';
    });

    recognition.addEventListener('error', (event) => {
      voiceRecognitionError = event.error || 'recognition-error';
    });

    recognition.addEventListener('end', () => {
      finishVoiceTranscription();
    }, { once: true });

    recognition.start();
    sendButton.disabled = true;
    photoButton.disabled = true;
    voiceButton.disabled = false;
    voiceButton.classList.add('is-recording');
    voiceButton.setAttribute('aria-pressed', 'true');
    voiceButton.setAttribute('aria-label', 'Stop and transcribe voice note');
    messageInput.placeholder = 'Listening… your words will appear here';
    showToast('Listening… speak now, then pause or tap the microphone');
    recordingTimer = window.setTimeout(() => speechRecognition?.stop(), maxVoiceDurationMs);
  } catch (error) {
    const errorCode = error?.code === 'insecure-context'
      ? error.code
      : ['NotAllowedError', 'SecurityError'].includes(error?.name)
        ? 'permission-denied'
        : error?.name === 'NotFoundError'
          ? 'audio-capture'
          : 'recognition-error';
    resetVoiceRecorder();
    showMediaError(voiceErrorMessage(errorCode));
  }
}

voiceButton.addEventListener('click', () => {
  if (voiceStartPending) return;
  if (speechRecognition) {
    window.clearTimeout(recordingTimer);
    recordingTimer = null;
    voiceButton.setAttribute('aria-label', 'Finishing voice transcription');
    speechRecognition.stop();
    return;
  }
  startVoiceRecording();
});

/* ---------- Menu ---------- */
function setMenu(open) {
  menu.classList.toggle('is-open', open);
  menu.setAttribute('aria-hidden', String(!open));
  menuButton.setAttribute('aria-expanded', String(open));

  if (open) document.querySelector('.menu-close').focus();
  else menuButton.focus();
}

menuButton.addEventListener('click', () => setMenu(true));
document.querySelector('.menu-close').addEventListener('click', () => setMenu(false));
document.querySelector('.menu-backdrop').addEventListener('click', () => setMenu(false));

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (shareCardOverlay?.classList.contains('is-open')) closeShareCard();
  else if (journalOverlay?.classList.contains('is-open')) closeJournal();
  else if (menu.classList.contains('is-open')) setMenu(false);
});

/* ---------- Secondary interactions ---------- */
const weeklyCard = document.querySelector('.daily-card');
const weeklyCount = document.querySelector('#weekly-count');
const weeklyGoalDisplay = document.querySelector('#weekly-goal');
const checkInPeriod = document.querySelector('#check-in-period');
const weeklyDotsContainer = document.querySelector('.weekly-dots');

function renderWeeklyTracker() {
  const today = new Date();
  const selectedGoal = goalConfig?.[weeklyGoalInput?.value] || { goal: weeklyGoal, period: 'week' };
  let periodStart;
  let periodEnd;
  if (selectedGoal.period === 'month') {
    periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
    periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else {
    periodStart = new Date(today);
    periodStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    periodEnd = new Date(periodStart);
    periodEnd.setDate(periodStart.getDate() + 6);
  }
  const startKey = toDateKey(periodStart);
  const endKey = toDateKey(periodEnd);
  const days = new Map();

  journalEntries
    .filter((entry) => entry.date >= startKey && entry.date <= endKey && questFieldTypes.includes(entry.type))
    .forEach((entry) => {
      if (!days.has(entry.date)) days.set(entry.date, new Set());
      days.get(entry.date).add(entry.type);
    });
  weeklyCheckIns = [...days.values()].filter((types) => types.size >= 4).length;

  weeklyGoal = selectedGoal.goal;
  weeklyCount.textContent = weeklyCheckIns;
  weeklyGoalDisplay.textContent = weeklyGoal;
  // A non-breaking hyphen keeps CHECK-INS together on the narrow room rail,
  // producing a clean two-line label instead of an orphaned “INS”.
  checkInPeriod.textContent = selectedGoal.period === 'month' ? 'MONTHLY CHECK‑INS' : 'WEEKLY CHECK‑INS';
  weeklyDotsContainer.replaceChildren();

  for (let index = 0; index < weeklyGoal; index += 1) {
    const dot = document.createElement('i');
    const complete = index < weeklyCheckIns;
    dot.classList.toggle('is-complete', complete);
    dot.textContent = complete ? '✓' : '';
    weeklyDotsContainer.append(dot);
  }

  weeklyCard.setAttribute('aria-label', `${selectedGoal.period === 'month' ? 'Monthly' : 'Weekly'} check-ins: ${weeklyCheckIns} of ${weeklyGoal} complete`);
}

weeklyCard.addEventListener('click', () => {
  const period = weeklyGoalInput?.value.startsWith('monthly_') ? 'monthly' : 'weekly';
  showToast(`${weeklyCheckIns} of ${weeklyGoal} ${period} check-ins · 4 fields completes a day`);
});

/* ---------- Journal calendar and day page ---------- */
const journalOverlay = document.querySelector('#journal-overlay');
const journalMonthView = document.querySelector('#journal-month-view');
const journalDayView = document.querySelector('#journal-day-view');
const calendarMonths = document.querySelector('#calendar-months');
const calendarTodayButton = document.querySelector('#calendar-today');
const calendarFilterButtons = [...document.querySelectorAll('[data-calendar-filter]')];
const dayTitle = document.querySelector('#day-title');
const daySections = document.querySelector('#day-sections');
let journalReturnFocus = null;
let journalMonthScrollTop = 0;
let calendarFilter = 'all';

let apiJournalEntries = [];
let journalFetchController = null;
let dailySummaryController = null;
let journalNavigation = { mode: 'calendar', dateKey: '', detailReturn: 'calendar' };
const journalDetailCache = new Map();
const dailySummaryCache = new Map();
const journalDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function subentryList(entry) {
  if (Array.isArray(entry?.subentries)) return entry.subentries.filter((item) => item && typeof item === 'object');
  return entry?.subentries && typeof entry.subentries === 'object' ? [entry.subentries] : [];
}

function mapStatusValue(value) {
  const status = String(value || '').trim().toUpperCase();
  if (['NORMAL', 'GREEN', 'GOOD'].includes(status) || status.includes('GREEN')) return 'normal';
  if (['WORRYING', 'YELLOW', 'MONITOR'].includes(status) || status.includes('YELLOW')) return 'worrying';
  if (['URGENT', 'RED', 'FLARE'].includes(status) || status.includes('RED')) return 'urgent';
  return 'neutral';
}

function statusForSubentry(subentry = {}) {
  const fromColour = mapStatusValue(subentry.color_status);
  return fromColour !== 'neutral' ? fromColour : mapStatusValue(subentry.analysis_status);
}

function highestStatus(statuses) {
  const rank = { neutral: 0, normal: 1, worrying: 2, urgent: 3 };
  return statuses.reduce((highest, status) => rank[status] > rank[highest] ? status : highest, 'neutral');
}

function normalizePatientEntry(rawEntry = {}) {
  const created = new Date(rawEntry.created_at);
  const subs = subentryList(rawEntry);
  const status = highestStatus(subs.map(statusForSubentry).concat(statusForSubentry(rawEntry)));
  const entryType = String(rawEntry.entry_type || 'ENTRY').trim().toUpperCase() || 'ENTRY';
  const appointment = entryType === 'DOCTOR_APPOINTMENT'
    ? subs.find((item) => item.appointment_date || item.reason_and_location_of_visit) || rawEntry
    : null;
  const appointmentDateKey = entryType === 'DOCTOR_APPOINTMENT'
    ? String(appointment?.appointment_date || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || ''
    : '';
  const appointmentDate = appointment?.appointment_date ? new Date(appointment.appointment_date) : null;
  const journalDate = appointmentDate && !Number.isNaN(appointmentDate.getTime()) ? appointmentDate : created;
  const hasValidJournalDate = !Number.isNaN(journalDate.getTime());
  return {
    id: rawEntry.id == null ? '' : String(rawEntry.id),
    entry_id: rawEntry.id == null ? '' : String(rawEntry.id),
    entry_type: entryType,
    type: entryType.toLowerCase(),
    value: appointment || subs[0] || {},
    subentries: rawEntry.subentries ?? null,
    source: rawEntry.input_from || 'patient',
    input_from: rawEntry.input_from || 'patient',
    analysed: Boolean(rawEntry.analysed),
    created_at: rawEntry.created_at || '',
    updated_at: rawEntry.updated_at || '',
    date: appointmentDateKey || (hasValidJournalDate ? toDateKey(journalDate) : ''),
    time: hasValidJournalDate ? journalDate.toLocaleTimeString([], { hour: entryType === 'DOCTOR_APPOINTMENT' ? 'numeric' : '2-digit', minute: '2-digit' }) : 'Time unavailable',
    status,
    api_entry: true,
    raw: rawEntry
  };
}

function sortEntriesNewestFirst(entries) {
  return [...entries].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

const dailyEntryTypeOrder = Object.freeze({ REFLECT: 0, FOOD: 1, TOILET: 2 });

function sortDailyEntries(entries) {
  return [...entries].sort((a, b) => {
    const aRank = dailyEntryTypeOrder[a.entry_type] ?? Number.MAX_SAFE_INTEGER;
    const bRank = dailyEntryTypeOrder[b.entry_type] ?? Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
}

function groupEntriesByDate(entries) {
  return entries.reduce((groups, entry) => {
    if (!entry.date) return groups;
    if (!groups.has(entry.date)) groups.set(entry.date, []);
    groups.get(entry.date).push(entry);
    return groups;
  }, new Map());
}

function journalViewEntries() {
  return apiJournalEntries;
}

function entriesForDay(dateKey) {
  return sortDailyEntries(journalViewEntries().filter((entry) => entry.date === dateKey));
}

function entryHasGoodComment(entry) {
  const rawText = [entry?.value, entry?.subentries, entry?.raw]
    .map((value) => {
      if (typeof value === 'string') return value;
      try { return JSON.stringify(value || ''); } catch { return ''; }
    })
    .join(' ')
    .replaceAll('_', ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLowerCase();

  // Green is reserved for something explicitly positive that the Champion
  // logged. A NORMAL analysis status alone does not turn the calendar green.
  return /\b(good day|all good|feel(?:ing)? good|felt good|doing well|feel(?:ing)? well|felt well|feeling better|felt better|much better|symptoms? (?:are |were )?(?:settled|calm|improved)|pain free|no pain|no blood|slept well|sleep (?:was |quality )?good|good sleep|energy (?:is |was )?good|good energy|mood (?:is |was )?sunny)\b/i.test(rawText);
}

function dayStatus(entries) {
  const healthEntries = entries.filter((entry) => entry.entry_type !== 'DOCTOR_APPOINTMENT');
  const status = highestStatus(healthEntries.map((entry) => entry.status));
  if (status === 'urgent' || status === 'worrying') return status;
  if (healthEntries.some(entryHasGoodComment)) return 'good';
  return 'neutral';
}

function statusLabel(status) {
  return { good: 'Good', normal: 'Normal', worrying: 'Needs attention', urgent: 'Urgent', neutral: 'Normal' }[status] || 'Normal';
}

function statusCssName(status) {
  return { good: 'good', worrying: 'monitor', urgent: 'red' }[status] || '';
}

function entryTypeIcon(type) {
  return { REFLECT: '💬', TOILET: '●', FOOD: '🍽', DOCTOR_APPOINTMENT: '🩺' }[String(type).toUpperCase()] || '•';
}

function entryTypeLabel(type) {
  if (String(type).toUpperCase() === 'DOCTOR_APPOINTMENT') return 'Doctor Appointment';
  const value = String(type || 'Entry').toLowerCase();
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
}

function formatSourceLabel(source) {
  const key = String(source || '').toLowerCase();
  return sourceLabels[key] || String(source || 'patient').replaceAll('_', ' ');
}

function monthSummary(entries) {
  if (!entries.length) return 'Nothing logged this month yet.';
  const counts = { normal: 0, worrying: 0, urgent: 0 };
  entries.forEach((entry) => { if (counts[entry.status] != null) counts[entry.status] += 1; });
  return `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · ${counts.normal} normal · ${counts.worrying} need attention · ${counts.urgent} urgent.`;
}

function calendarRange(entries) {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), 1);
  const visiblePastStart = new Date(current.getFullYear(), current.getMonth() - 6, 1);
  const visibleFutureEnd = new Date(current.getFullYear(), current.getMonth() + 6, 1);
  const entryMonths = entries
    .filter((entry) => journalDatePattern.test(entry.date || ''))
    .map((entry) => {
      const [year, month] = entry.date.split('-').map(Number);
      return new Date(year, month - 1, 1);
    });
  const earliest = entryMonths.length
    ? new Date(Math.min(visiblePastStart.getTime(), ...entryMonths.map((date) => date.getTime())))
    : visiblePastStart;
  const latest = entryMonths.length
    ? new Date(Math.max(visibleFutureEnd.getTime(), ...entryMonths.map((date) => date.getTime())))
    : visibleFutureEnd;
  const result = [];
  for (let cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1); cursor <= latest; cursor.setMonth(cursor.getMonth() + 1)) {
    result.push(new Date(cursor));
  }
  return result;
}

function createCalendarEntryChip(entry, dateKey) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `calendar-entry-chip status-${entry.status}`;
  const isDoctorAppointment = entry.entry_type === 'DOCTOR_APPOINTMENT';
  chip.classList.toggle('is-appointment', isDoctorAppointment);
  chip.setAttribute('aria-label', isDoctorAppointment
    ? `Doctor Appointment at ${entry.time}. View appointment.`
    : `${entryTypeLabel(entry.entry_type)} at ${entry.time}, ${statusLabel(entry.status)}. View full entry.`);
  chip.title = isDoctorAppointment
    ? `Doctor Appointment · ${entry.time}`
    : `${entryTypeLabel(entry.entry_type)} · ${entry.time} · ${statusLabel(entry.status)}`;
  const icon = document.createElement('span'); icon.className = 'calendar-entry-icon'; icon.textContent = entryTypeIcon(entry.entry_type); icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.className = 'calendar-entry-label'; label.textContent = entryTypeLabel(entry.entry_type);
  chip.append(icon, label);
  chip.addEventListener('click', () => openEntryDetail(entry.id, dateKey, 'calendar'));
  return chip;
}

function buildCalendarMonth(year, month, groupedEntries) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondayOffset = (first.getDay() + 6) % 7;
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const entries = journalViewEntries().filter((entry) => entry.date.startsWith(monthPrefix));
  const section = document.createElement('section'); section.className = 'calendar-month'; section.dataset.month = monthPrefix;
  const header = document.createElement('header'); header.className = 'calendar-month-header';
  const heading = document.createElement('h3'); heading.className = 'calendar-month-title'; heading.textContent = first.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const currentPrefix = toDateKey().slice(0, 7);
  const label = document.createElement('span'); label.className = 'calendar-month-label';
  label.textContent = monthPrefix === currentPrefix ? 'This month' : monthPrefix < currentPrefix ? 'Past month' : 'Upcoming';
  const counts = document.createElement('p'); counts.className = 'month-counts'; counts.textContent = monthSummary(entries);
  header.append(heading, label, counts);
  const weekdays = document.createElement('div'); weekdays.className = 'calendar-weekdays'; weekdays.setAttribute('aria-hidden','true');
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach((day) => { const item=document.createElement('span'); item.textContent=day; weekdays.append(item); });
  const grid = document.createElement('div'); grid.className = 'calendar-grid'; grid.setAttribute('aria-label', heading.textContent);
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;

  for (let cell = 0; cell < cellCount; cell += 1) {
    const day = cell - mondayOffset + 1;
    const dayCell = document.createElement('div'); dayCell.className = 'calendar-day';
    if (day < 1 || day > daysInMonth) {
      dayCell.classList.add('is-outside'); dayCell.setAttribute('aria-hidden','true'); grid.append(dayCell); continue;
    }
    const dateKey = `${monthPrefix}-${String(day).padStart(2, '0')}`;
    const dayEntries = sortDailyEntries(groupedEntries.get(dateKey) || []);
    const status = dayStatus(dayEntries);
    const cssStatus = statusCssName(status);
    const hasAppointment = dayEntries.some((entry) => entry.entry_type === 'DOCTOR_APPOINTMENT');
    dayCell.setAttribute('aria-label', `${first.toLocaleDateString([], { month: 'long' })} ${day}, ${dayEntries.length} ${dayEntries.length === 1 ? 'entry' : 'entries'}, ${statusLabel(status)}`);
    if (dateKey === toDateKey()) dayCell.classList.add('is-today');
    if (cssStatus) dayCell.classList.add(`status-${cssStatus}`);
    const matchesFilter = calendarFilter === 'all'
      || (calendarFilter === 'flare' && status === 'urgent')
      || (calendarFilter === 'appointment' && hasAppointment);
    dayCell.classList.toggle('is-filtered-out', !matchesFilter);

    const dayButton = document.createElement('button'); dayButton.type = 'button'; dayButton.className = 'calendar-day-number'; dayButton.textContent = day;
    dayButton.setAttribute('aria-label', `View Daily IBD Analysis for ${dateKey}`);
    dayButton.addEventListener('click', () => openDayView(dateKey));
    dayCell.append(dayButton);
    dayCell.addEventListener('click', (event) => {
      if (!event.target.closest('button')) openDayView(dateKey);
    });

    const indicators = document.createElement('span'); indicators.className = 'calendar-indicators'; indicators.setAttribute('aria-hidden', 'true');
    if (status !== 'neutral') {
      const statusDot = document.createElement('i'); statusDot.className = `dot dot--${status === 'urgent' ? 'red' : status === 'worrying' ? 'yellow' : 'green'}`;
      indicators.append(statusDot);
    }
    if (hasAppointment) { const appointmentMark = document.createElement('i'); appointmentMark.className = 'appointment-diamond'; indicators.append(appointmentMark); }
    dayCell.append(indicators);

    if (dayEntries.length) {
      const chips = document.createElement('div'); chips.className = 'calendar-entry-chips';
      dayEntries.slice(0, 3).forEach((entry) => chips.append(createCalendarEntryChip(entry, dateKey)));
      if (dayEntries.length > 3) {
        const more = document.createElement('button'); more.type = 'button'; more.className = 'calendar-entry-more'; more.textContent = `+${dayEntries.length - 3}`;
        more.setAttribute('aria-label', `View ${dayEntries.length - 3} more entries`); more.addEventListener('click', () => openDayView(dateKey)); chips.append(more);
      }
      dayCell.append(chips);
    }
    grid.append(dayCell);
  }
  section.append(header, weekdays, grid);
  return section;
}

function renderCalendar() {
  calendarMonths.replaceChildren();
  const entries = journalViewEntries();
  const groupedEntries = groupEntriesByDate(entries);
  calendarRange(entries).forEach((date) => calendarMonths.append(buildCalendarMonth(date.getFullYear(), date.getMonth(), groupedEntries)));
}

function setCalendarFilter(nextFilter) {
  calendarFilter = ['all', 'flare', 'appointment'].includes(nextFilter) ? nextFilter : 'all';
  calendarFilterButtons.forEach((button) => {
    const active = button.dataset.calendarFilter === calendarFilter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderCalendar();
  window.requestAnimationFrame(() => scrollToCurrentMonth('auto'));
}

function scrollToMonth(monthKey, behavior = 'smooth') {
  const currentMonth = calendarMonths.querySelector(`[data-month="${monthKey}"]`);
  if (!currentMonth) return;
  const viewTop = journalMonthView.getBoundingClientRect().top;
  const monthTop = currentMonth.getBoundingClientRect().top;
  const toolbarHeight = journalMonthView.querySelector('.journal-timeline-toolbar')?.offsetHeight || 0;
  const nextTop = journalMonthView.scrollTop + monthTop - viewTop - toolbarHeight - 8;
  journalMonthView.scrollTo({ top: Math.max(0, nextTop), behavior });
}

function scrollToCurrentMonth(behavior = 'smooth') {
  scrollToMonth(toDateKey().slice(0, 7), behavior);
}

function formatEntryValue(entry) {
  const value = entry.value;
  if (entry.api_entry && entry.type === 'doctor_appointment') return value.reason_and_location_of_visit || 'Doctor appointment';
  if (entry.api_entry && entry.type === 'reflect') return value.reflection_text || 'Reflection';
  if (entry.api_entry && entry.type === 'toilet') return `Toilet entry${value.stool_type != null ? ` · Bristol ${value.stool_type}` : ''}${value.stool_blood ? ` · blood: ${value.stool_blood}` : ''}`;
  if (entry.api_entry && entry.type === 'food') return value.food_description || 'Food entry';
  if (entry.type === 'energy') return `Energy ${value}`;
  if (entry.type === 'mood') return `Mood ${value}`;
  if (entry.type === 'sleep') return `Sleep ${value?.quality || value || 'not rated'}${value?.woke_to_go != null ? ` · woke to go ${value.woke_to_go}` : ''}`;
  if (entry.type === 'toilet_trips') return `${value} toilet trips`;
  if (entry.type === 'stool_type') return `Bristol type ${value?.bristol ?? value}${value?.urgency ? ' · had to rush' : ''}${value?.trips_band ? ' · more than 4 times' : ''}`;
  if (entry.type === 'blood') return `Blood: ${String(value).replaceAll('_', ' ')}`;
  if (entry.type === 'pain') {
    const locations = Array.isArray(value?.locations) ? value.locations.join(', ') : value?.location || '';
    const timing = Array.isArray(value?.timing) ? value.timing.join(', ') : value?.timing || '';
    return `Pain ${value?.score ?? value}/10${locations ? ` · ${locations}` : ''}${timing ? ` · ${timing}` : ''}`;
  }
  if (entry.type === 'food') return `${value.meal} · protein: ${value.protein}${value.status ? ` · ${value.status}${value.set_by ? ` by ${value.set_by}` : ''}` : ''}${value.after ? ` · after: ${value.after}` : ''}`;
  if (entry.type === 'medicine') {
    if (value.doses) return `${value.name || 'Medicine'} · ${value.doses.map((dose) => `${dose.slot} taken`).join(', ')}`;
    return `${value.name} · ${value.status}${value.reason ? ` · reason: ${value.reason}` : ''}${value.side_effects ? ` · side effects: ${value.side_effects}` : ''}${value.also_taking ? ` · also taking: ${value.also_taking}` : ''}`;
  }
  if (entry.type === 'flare_report') return `Flare report · ${value.reason} · ${value.routed_to}`;
  if (typeof value === 'object') {
    const headline = value.title || value.text || value.reason || entry.type.replaceAll('_', ' ');
    const details = Object.entries(value)
      .filter(([key]) => !['title', 'text', 'reason'].includes(key))
      .map(([key, item]) => `${key.replaceAll('_', ' ')}: ${item}`)
      .join(' · ');
    return details ? `${headline} · ${details}` : headline;
  }
  return String(value);
}

function isValidJournalDate(dateKey) {
  if (!journalDatePattern.test(dateKey)) return false;
  const [year, month, day] = dateKey.split('-').map(Number);
  const candidate = new Date(year, month - 1, day, 12);
  return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day;
}

function renderDailyAnalysisState(host, state, action) {
  host.replaceChildren();
  const status = document.createElement('div'); status.className = `daily-analysis-state is-${state}`;
  if (state === 'loading') {
    const spinner = document.createElement('span'); spinner.className = 'daily-analysis-spinner'; spinner.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('strong'); copy.textContent = "Analyzing your day's health data…";
    status.append(spinner, copy);
  } else {
    const copy = document.createElement('p');
    copy.textContent = state === 'empty'
      ? 'No AI analysis was returned for this date.'
      : state === 'invalid-id'
        ? 'Add your complete Champion ID in your profile before requesting an analysis.'
        : 'We couldn’t generate your daily analysis right now. Please try again.';
    status.append(copy);
    if (action) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = state === 'invalid-id' ? 'Open profile' : 'Try again';
      button.addEventListener('click', action); status.append(button);
    }
  }
  host.append(status);
}

function renderDailyAnalysis(host, markdown) {
  host.replaceChildren();
  const content = document.createElement('div'); content.className = 'daily-analysis-content';
  renderMarkdown(content, markdown);
  host.append(content);
}

function createDailyAnalysisPanel(dateKey) {
  const section = document.createElement('section'); section.className = 'daily-analysis'; section.id = 'daily-analysis'; section.dataset.date = dateKey;
  const header = document.createElement('header');
  const icon = document.createElement('span'); icon.textContent = '✨'; icon.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div');
  const eyebrow = document.createElement('small'); eyebrow.textContent = 'HEARD AI';
  const title = document.createElement('h4'); title.textContent = 'Daily IBD Analysis';
  copy.append(eyebrow, title); header.append(icon, copy); section.append(header);
  const body = document.createElement('div'); body.className = 'daily-analysis-body'; section.append(body);
  const cached = dailySummaryCache.get(dateKey);
  if (cached) renderDailyAnalysis(body, cached);
  else renderDailyAnalysisState(body, 'loading');
  return section;
}

function currentDailyAnalysisBody(dateKey) {
  if (journalNavigation.mode !== 'day' || journalNavigation.dateKey !== dateKey) return null;
  return daySections.querySelector(`.daily-analysis[data-date="${dateKey}"] .daily-analysis-body`);
}

async function loadDailyAnalysis(dateKey) {
  const host = currentDailyAnalysisBody(dateKey);
  if (!host) return;
  const patientId = cleanPatientRecord(savedPatientId || patientIdInput?.value);
  if (!isValidPatientRecord(patientId)) {
    renderDailyAnalysisState(host, 'invalid-id', () => { closeJournal(); setMenu(true); });
    return;
  }
  if (!isValidJournalDate(dateKey)) {
    renderDailyAnalysisState(host, 'error');
    return;
  }

  dailySummaryController?.abort();
  const controller = new AbortController();
  dailySummaryController = controller;
  let timedOut = false;
  const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
  renderDailyAnalysisState(host, 'loading');

  try {
    const response = await fetchJournalJson(journalDailySummaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: patientId, date: dateKey }),
      signal: controller.signal
    });
    if (dailySummaryController !== controller) return;
    const analysis = typeof response?.ai_response === 'string' ? response.ai_response.trim() : '';
    const activeHost = currentDailyAnalysisBody(dateKey);
    if (!analysis) {
      dailySummaryCache.delete(dateKey);
      if (activeHost) renderDailyAnalysisState(activeHost, 'empty');
      return;
    }
    dailySummaryCache.set(dateKey, analysis);
    if (activeHost) renderDailyAnalysis(activeHost, analysis);
  } catch (error) {
    if (error.name === 'AbortError' && !timedOut) return;
    const activeHost = currentDailyAnalysisBody(dateKey);
    if (activeHost) renderDailyAnalysisState(activeHost, 'error', () => loadDailyAnalysis(dateKey));
  } finally {
    window.clearTimeout(timeout);
    if (dailySummaryController === controller) dailySummaryController = null;
  }
}

function renderDayView(dateKey) {
  const entries = entriesForDay(dateKey);
  dayTitle.textContent = new Date(`${dateKey}T12:00:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  daySections.replaceChildren();
  document.querySelector('#day-back').textContent = '‹ Calendar';
  journalNavigation = { mode: 'day', dateKey, detailReturn: 'calendar' };
  daySections.append(createDailyAnalysisPanel(dateKey));
  if (!entries.length) {
    const empty = document.createElement('p'); empty.className = 'empty-day'; empty.textContent = 'Nothing was logged on this day.'; daySections.append(empty); return;
  }
  const hasDoctorAppointment = entries.some((entry) => entry.entry_type === 'DOCTOR_APPOINTMENT');
  const intro = document.createElement('p'); intro.className = 'day-entry-intro'; intro.textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · Reflection, Food, then Toilet${hasDoctorAppointment ? ' · Doctor Appointment' : ''}`;
  const list = document.createElement('div'); list.className = 'day-entry-list';
  entries.forEach((entry) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = `day-entry-card status-${entry.status}`;
    button.classList.toggle('is-appointment', entry.entry_type === 'DOCTOR_APPOINTMENT');
    const icon = document.createElement('span'); icon.className = 'day-entry-icon'; icon.textContent = entryTypeIcon(entry.entry_type); icon.setAttribute('aria-hidden','true');
    const copy = document.createElement('span'); copy.className = 'day-entry-copy';
    const title = document.createElement('strong'); title.textContent = entryTypeLabel(entry.entry_type);
    const meta = document.createElement('small'); meta.textContent = `${entry.time} · ${formatSourceLabel(entry.input_from)}`;
    const status = document.createElement('em'); status.className = `entry-status status-${entry.status}`; status.textContent = statusLabel(entry.status);
    const arrow = document.createElement('b'); arrow.textContent = '›'; arrow.setAttribute('aria-hidden','true');
    copy.append(title, meta);
    if (entry.entry_type === 'DOCTOR_APPOINTMENT' && entry.value?.reason_and_location_of_visit) {
      const appointmentInfo = document.createElement('span');
      appointmentInfo.className = 'day-entry-appointment';
      appointmentInfo.textContent = entry.value.reason_and_location_of_visit;
      copy.append(appointmentInfo);
    }
    if (entry.entry_type !== 'DOCTOR_APPOINTMENT') copy.append(status);
    if (entry.entry_type === 'FOOD' && entry.value?.food_image) {
      const foodPreview = createFoodImage(entry.value.food_image, { thumbnail: true });
      if (foodPreview) copy.append(foodPreview);
    }
    button.append(icon, copy, arrow);
    button.addEventListener('click', () => openEntryDetail(entry.id, dateKey, 'day'));
    list.append(button);
  });
  daySections.append(intro, list);
}

function openDayView(dateKey) {
  if (!isValidJournalDate(dateKey)) return;
  journalMonthScrollTop = journalMonthView.scrollTop;
  renderDayView(dateKey);
  journalMonthView.hidden = true;
  journalDayView.hidden = false;
  loadDailyAnalysis(dateKey);
}

function formatDetailValue(value) {
  if (value == null || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(formatDetailValue).join(', ') : 'Not provided';
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${entryTypeLabel(key)}: ${formatDetailValue(item)}`).join(' · ');
  return String(value).replaceAll('_', ' ');
}

function addDetailField(container, labelText, value, options = {}) {
  const row = document.createElement('div'); row.className = `entry-detail-field${options.wide ? ' is-wide' : ''}`;
  const label = document.createElement('dt'); label.textContent = labelText;
  const detail = document.createElement('dd'); detail.textContent = formatDetailValue(value);
  row.append(label, detail); container.append(row);
}

function renderFoodMacros(macros, container) {
  if (!Array.isArray(macros) || !macros.length) return;
  const section = document.createElement('section'); section.className = 'food-macros';
  const heading = document.createElement('h4'); heading.textContent = 'Food breakdown'; section.append(heading);
  macros.forEach((macro) => {
    const card = document.createElement('article'); card.className = 'food-macro-card';
    const title = document.createElement('strong'); title.textContent = macro?.title || 'Food item'; card.append(title);
    const grid = document.createElement('dl'); grid.className = 'food-macro-grid';
    [['Weight', macro?.weight], ['Calories', macro?.calories], ['Protein', macro?.protein], ['Carbohydrates', macro?.carbohydrates], ['Fats', macro?.fats], ['Fiber', macro?.fiber]].forEach(([label, value]) => addDetailField(grid, label, value));
    card.append(grid); section.append(card);
  });
  container.append(section);
}

function resolveFoodImage(path) {
  const cleanPath = String(path || '').trim();
  if (!cleanPath) return '';
  try {
    const url = new URL(cleanPath.replace(/^\/+/, ''), journalMediaBaseUrl);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

async function loadFoodImage(imageUrl, image, fallback) {
  let objectUrl = '';
  try {
    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: { ...journalRequestHeaders, Accept: 'image/*' }
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.toLowerCase().startsWith('image/')) throw new Error('Invalid image response');
    const imageBlob = await response.blob();
    if (!imageBlob.type.toLowerCase().startsWith('image/')) throw new Error('Invalid image data');
    objectUrl = URL.createObjectURL(imageBlob);
    image.addEventListener('load', () => {
      image.hidden = false;
      fallback.classList.remove('is-loading');
      fallback.hidden = true;
      URL.revokeObjectURL(objectUrl);
    }, { once: true });
    image.addEventListener('error', () => {
      image.hidden = true;
      fallback.classList.remove('is-loading');
      fallback.textContent = 'Food image unavailable';
      fallback.hidden = false;
      URL.revokeObjectURL(objectUrl);
    }, { once: true });
    image.src = objectUrl;
  } catch {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    image.hidden = true;
    fallback.classList.remove('is-loading');
    fallback.textContent = 'Food image unavailable';
    fallback.hidden = false;
  }
}

function createFoodImage(path, options = {}) {
  const imageUrl = resolveFoodImage(path);
  if (!imageUrl) return null;
  const frame = document.createElement('figure');
  frame.className = `food-image-frame${options.thumbnail ? ' is-thumbnail' : ''}`;
  const image = document.createElement('img');
  image.className = 'entry-food-image';
  image.alt = 'Food attached to this journal entry';
  image.decoding = 'async';
  image.hidden = true;
  const fallback = document.createElement('figcaption');
  fallback.className = 'food-image-fallback is-loading';
  fallback.textContent = 'Loading food image…';
  fallback.setAttribute('aria-live', 'polite');
  frame.append(image, fallback);
  loadFoodImage(imageUrl, image, fallback);
  return frame;
}

function renderEntryDetail(rawDetail, summary) {
  const raw = rawDetail?.entry || rawDetail?.data || rawDetail || {};
  const detail = normalizePatientEntry({ ...summary?.raw, ...raw, id: raw.id ?? summary?.id, entry_type: raw.entry_type ?? summary?.entry_type, created_at: raw.created_at ?? summary?.created_at });
  const subs = subentryList(raw).length ? subentryList(raw) : subentryList(summary?.raw);
  dayTitle.textContent = entryTypeLabel(detail.entry_type);
  daySections.replaceChildren();
  const hero = document.createElement('header'); hero.className = `entry-detail-hero status-${detail.status}`;
  const heroIcon = document.createElement('span'); heroIcon.textContent = entryTypeIcon(detail.entry_type); heroIcon.setAttribute('aria-hidden','true');
  const heroCopy = document.createElement('div'); const heroTitle = document.createElement('h4'); heroTitle.textContent = entryTypeLabel(detail.entry_type);
  const heroMeta = document.createElement('p'); heroMeta.textContent = `${detail.date || 'Date unavailable'} · ${detail.time} · ${formatSourceLabel(detail.input_from)}`;
  const heroStatus = document.createElement('span'); heroStatus.className = `entry-status status-${detail.status}`; heroStatus.textContent = statusLabel(detail.status);
  heroCopy.append(heroTitle, heroMeta);
  if (detail.entry_type !== 'DOCTOR_APPOINTMENT') heroCopy.append(heroStatus);
  hero.append(heroIcon, heroCopy); daySections.append(hero);

  const subentries = subs.length ? subs : detail.entry_type === 'DOCTOR_APPOINTMENT' ? [detail.value] : [{}];
  subentries.forEach((subentry, index) => {
    const section = document.createElement('section'); section.className = 'entry-detail-section';
    if (subentries.length > 1) { const heading = document.createElement('h4'); heading.textContent = `Item ${index + 1}`; section.append(heading); }
    const fields = document.createElement('dl'); fields.className = 'entry-detail-grid';
    if (detail.entry_type === 'REFLECT') {
      addDetailField(fields, 'Reflection', subentry.reflection_text, { wide: true });
      addDetailField(fields, 'Analysis status', subentry.analysis_status);
      addDetailField(fields, 'Colour status', subentry.color_status);
      addDetailField(fields, 'AI analysis', subentry.analysis_text, { wide: true });
    } else if (detail.entry_type === 'TOILET') {
      addDetailField(fields, 'Stool type', subentry.stool_type);
      addDetailField(fields, 'Blood', subentry.stool_blood);
      addDetailField(fields, 'Urgency', subentry.stool_urgency);
      addDetailField(fields, 'At night', subentry.stool_at_night);
      addDetailField(fields, 'Analysis status', subentry.analysis_status);
      addDetailField(fields, 'Colour status', subentry.color_status);
      addDetailField(fields, 'AI analysis', subentry.analysis_text, { wide: true });
    } else if (detail.entry_type === 'FOOD') {
      addDetailField(fields, 'Food description', subentry.food_description, { wide: true });
      addDetailField(fields, 'Analysis status', subentry.analysis_status);
      addDetailField(fields, 'Colour status', subentry.color_status);
      addDetailField(fields, 'AI analysis', subentry.analysis_text, { wide: true });
    } else if (detail.entry_type === 'DOCTOR_APPOINTMENT') {
      const appointmentDate = new Date(subentry.appointment_date);
      const appointmentDateLabel = Number.isNaN(appointmentDate.getTime())
        ? subentry.appointment_date
        : appointmentDate.toLocaleString([], { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
      addDetailField(fields, 'Appointment date and time', appointmentDateLabel, { wide: true });
      addDetailField(fields, 'Reason and location', subentry.reason_and_location_of_visit, { wide: true });
    } else {
      const available = Object.entries(subentry).filter(([key]) => key !== 'id' && key !== 'food_macros' && key !== 'food_image');
      if (available.length) available.forEach(([key, value]) => addDetailField(fields, entryTypeLabel(key), value, { wide: ['analysis_text', 'reflection_text'].includes(key) }));
      else addDetailField(fields, 'Details', 'No additional details were returned.', { wide: true });
    }
    section.append(fields);
    if (detail.entry_type === 'FOOD') {
      const foodImage = createFoodImage(subentry.food_image);
      if (foodImage) section.append(foodImage);
      renderFoodMacros(subentry.food_macros, section);
    }
    daySections.append(section);
  });

  if (detail.entry_type !== 'DOCTOR_APPOINTMENT') {
    const metadata = document.createElement('dl'); metadata.className = 'entry-detail-grid entry-detail-metadata';
    addDetailField(metadata, 'Entry ID', detail.id, { wide: true });
    addDetailField(metadata, 'Analysis', detail.analysed ? 'Complete' : 'Pending');
    addDetailField(metadata, 'Created', detail.created_at ? new Date(detail.created_at).toLocaleString() : null);
    addDetailField(metadata, 'Updated', detail.updated_at ? new Date(detail.updated_at).toLocaleString() : null);
    daySections.append(metadata);
  }
}

async function fetchJournalJson(url, options = {}) {
  const response = await fetch(url, {
    method: 'GET',
    ...options,
    headers: { ...journalRequestHeaders, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || data?.message || `Request failed (${response.status})`);
  if (data == null) throw new Error('The server returned an unexpected response.');
  return data;
}

async function openEntryDetail(entryId, dateKey, detailReturn = 'calendar') {
  if (!entryId) return;
  journalMonthScrollTop = journalMonthView.scrollTop;
  journalNavigation = { mode: 'detail', dateKey, detailReturn };
  journalMonthView.hidden = true; journalDayView.hidden = false;
  document.querySelector('#day-back').textContent = detailReturn === 'day' ? '‹ Day' : '‹ Calendar';
  dayTitle.textContent = 'Loading entry…';
  daySections.replaceChildren();
  const loading = document.createElement('div'); loading.className = 'journal-loading'; loading.innerHTML = '<span></span><strong>Loading complete entry…</strong>'; daySections.append(loading);
  const summary = apiJournalEntries.find((entry) => entry.id === String(entryId));
  try {
    const detail = journalDetailCache.has(String(entryId)) ? journalDetailCache.get(String(entryId)) : await fetchJournalJson(journalEntryUrl(entryId));
    journalDetailCache.set(String(entryId), detail);
    if (journalNavigation.mode === 'detail' && journalNavigation.dateKey === dateKey) renderEntryDetail(detail, summary);
  } catch (error) {
    dayTitle.textContent = 'Entry unavailable'; daySections.replaceChildren();
    const message = document.createElement('div'); message.className = 'journal-state is-error';
    const heading = document.createElement('strong'); heading.textContent = 'We couldn’t load this entry.';
    const copy = document.createElement('p'); copy.textContent = error.message || 'Check that the Django API is running, then try again.';
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Try again'; retry.addEventListener('click', () => { journalDetailCache.delete(String(entryId)); openEntryDetail(entryId, dateKey, detailReturn); });
    message.append(heading, copy, retry); daySections.append(message);
  }
}

function renderJournalState(title, copy, actionLabel, action) {
  calendarMonths.replaceChildren();
  const state = document.createElement('div'); state.className = 'journal-state';
  const heading = document.createElement('strong'); heading.textContent = title;
  const message = document.createElement('p'); message.textContent = copy;
  state.append(heading, message);
  if (actionLabel && action) { const button = document.createElement('button'); button.type = 'button'; button.textContent = actionLabel; button.addEventListener('click', action); state.append(button); }
  calendarMonths.append(state);
}

async function loadJournalFromApi() {
  const patientId = cleanPatientRecord(savedPatientId || patientIdInput?.value);
  if (!isValidPatientRecord(patientId)) {
    apiJournalEntries = [];
    journalNavigation = { mode: 'calendar', dateKey: '', detailReturn: 'calendar' };
    journalDayView.hidden = true;
    journalMonthView.hidden = false;
    renderJournalState('Add your Champion ID', 'Enter the complete clinic Champion ID in your profile to load your health journey.', 'Open profile', () => { closeJournal(); setMenu(true); });
    return;
  }
  journalFetchController?.abort();
  journalFetchController = new AbortController();
  renderJournalState('Loading your health journey…', 'Fetching your latest journal entries from HEARD.');
  try {
    const patient = await fetchJournalJson(patientJournalUrl(patientId), { signal: journalFetchController.signal });
    const rawEntries = Array.isArray(patient?.patient_entries) ? patient.patient_entries : [];
    apiJournalEntries = sortEntriesNewestFirst(rawEntries.map(normalizePatientEntry).filter((entry) => entry.id && entry.date));
    journalDetailCache.clear();
    renderCalendar();
    if (journalNavigation.mode === 'day') {
      renderDayView(journalNavigation.dateKey);
    } else {
      window.requestAnimationFrame(() => scrollToCurrentMonth('auto'));
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    apiJournalEntries = [];
    renderJournalState('Journal couldn’t connect', error.message || 'The HEARD service is unavailable right now. Please try again.', 'Try again', loadJournalFromApi);
  }
}

function openJournal() {
  journalReturnFocus = document.activeElement;
  dailySummaryCache.clear();
  journalOverlay.classList.add('is-open');
  journalOverlay.setAttribute('aria-hidden', 'false');
  openDayView(toDateKey());
  document.querySelector('#journal-close').focus();
  loadJournalFromApi();
}

function closeJournal() {
  journalFetchController?.abort();
  dailySummaryController?.abort();
  const returnTarget = journalReturnFocus?.isConnected ? journalReturnFocus : document.querySelector('.journal-card');
  returnTarget.focus();
  journalOverlay.classList.remove('is-open');
  journalOverlay.setAttribute('aria-hidden', 'true');
}

function buildShareSummary(startDate, endDate) {
  const entries = journalViewEntries().filter((entry) => entry.date >= startDate && entry.date <= endDate && !entry.private);
  const lines = [`IBD Journal · ${startDate} to ${endDate}`, monthSummary(entries), ''];
  Object.entries(journalSectionTypes).forEach(([sectionName, types]) => {
    const sectionEntries = entries.filter((entry) => types.includes(entry.type));
    if (!sectionEntries.length) return;
    lines.push(sectionName);
    sectionEntries.forEach((entry) => lines.push(`• ${entry.date} — ${formatEntryValue(entry)} (${formatSourceLabel(entry.source)})`));
    lines.push('');
  });
  return lines.join('\n');
}

const shareCardOverlay = document.querySelector('#share-card-overlay');
const shareCardContent = document.querySelector('#share-card-content');
const shareApproval = document.querySelector('#share-approval');
const shareCardQr = document.querySelector('#share-card-qr');
const shareCardReview = document.querySelector('#share-card-review');
let activeShareRange = null;
const monthlySummaryRequests = new Map();

function addShareSection(title, content) {
  const section = document.createElement('section');
  section.className = 'share-section';
  const heading = document.createElement('h3');
  heading.textContent = title;
  section.append(heading, content);
  shareCardContent.append(section);
  return section;
}

function entryList(entries) {
  const list = document.createElement('ul');
  entries.forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = `${entry.date} — ${formatEntryValue(entry)} (${formatSourceLabel(entry.source)})${entry.ask_team ? ' · ask my team' : ''}`;
    list.append(item);
  });
  return list;
}

function generatedNinetySecondSummary(entries) {
  if (!entries.length) return 'Nothing was logged this month.';
  const first = entries[0];
  const latest = entries.at(-1);
  const concerns = entries.filter((entry) => entry.ask_team || entry.type === 'flare_report');
  const medicineChanges = entries.filter((entry) => entry.type === 'medicine');
  return [
    `Records run from ${first.date} to ${latest.date}.`,
    medicineChanges.length ? `${medicineChanges.length} medicine adherence ${medicineChanges.length === 1 ? 'entry was' : 'entries were'} logged.` : 'No medicine adherence was logged.',
    concerns.length ? `${concerns.length} item${concerns.length === 1 ? ' is' : 's are'} marked for the care team.` : 'No items are currently marked for the care team.',
    `Champion’s latest concern: ${formatEntryValue(concerns.at(-1) || latest)}.`
  ].join(' ');
}

function sccaiCoverage(entries) {
  const components = [
    entries.some((entry) => ['toilet', 'toilet_trips', 'stool_type'].includes(entry.type)),
    entries.some((entry) => entry.type === 'sleep' && entry.value?.woke_to_go != null),
    entries.some((entry) => entry.type === 'stool_type' && entry.value?.urgency != null),
    entries.some((entry) => entry.type === 'blood'),
    entries.some((entry) => entry.type === 'energy'),
    entries.some((entry) => entry.type === 'note' && entry.value?.extra_colonic)
  ].filter(Boolean).length;
  return components;
}

function createShareQr() {
  const panel = document.createElement('section'); panel.className = 'share-qr';
  const link = document.createElement('a'); link.href = shareDestinationUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label', 'Open the existing HEARD Clinician Dashboard');
  const image = document.createElement('img'); image.src = './public/heard-share-qr.png'; image.alt = 'QR code to open the HEARD Clinician Dashboard'; image.width = 512; image.height = 512;
  const heading = document.createElement('strong'); heading.textContent = 'Scan to view clinician dashboard';
  const copy = document.createElement('p'); copy.textContent = 'The existing HEARD dashboard link is unchanged.';
  link.append(image); panel.append(link, heading, copy); return panel;
}

function renderMonthlySummaryState(host, state, retry) {
  host.replaceChildren();
  host.setAttribute('aria-busy', String(state === 'loading'));
  const panel = document.createElement('div'); panel.className = `monthly-summary-state is-${state}`;
  if (state === 'loading') {
    const spinner = document.createElement('span'); spinner.className = 'daily-analysis-spinner'; spinner.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('strong'); copy.textContent = 'Generating monthly summary…';
    panel.append(spinner, copy);
  } else {
    const copy = document.createElement('p');
    copy.textContent = state === 'invalid-id'
      ? 'Unable to load the monthly summary. Add a valid Champion ID in the profile and try again.'
      : state === 'empty'
        ? 'No monthly summary was returned for this period.'
        : 'Unable to load the monthly summary. Please try again.';
    panel.append(copy);
    if (retry) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = state === 'invalid-id' ? 'Open profile' : 'Try again';
      button.addEventListener('click', retry); panel.append(button);
    }
  }
  host.append(panel);
}

function renderMonthlySummary(host, markdown) {
  host.replaceChildren();
  host.setAttribute('aria-busy', 'false');
  const content = document.createElement('div'); content.className = 'monthly-summary-markdown';
  renderMarkdown(content, markdown);
  const review = document.createElement('details'); review.className = 'share-privacy-review';
  const reviewTitle = document.createElement('summary'); reviewTitle.textContent = 'Review or remove sensitive information';
  const reviewBody = document.createElement('div');
  const reviewCopy = document.createElement('p'); reviewCopy.textContent = 'Edit this copy before approving it. Remove anything you do not want included in the clinician view.';
  const editor = document.createElement('textarea'); editor.value = markdown; editor.setAttribute('aria-label', 'Edit the information included in this Share Card');
  editor.addEventListener('input', () => { if (activeShareRange) activeShareRange.sharedSummary = editor.value; });
  reviewBody.append(reviewCopy, editor); review.append(reviewTitle, reviewBody);
  host.append(content, review);
}

/**
 * Request the clinician-facing monthly summary.
 *
 * This deliberately reads the response as text first. Free ngrok tunnels and
 * Django debug pages can return text/html or text/plain instead of JSON; those
 * responses must never be rendered inside the Share Card.
 */
async function fetchMonthlySummary(patientId, year, month) {
  const payload = {
    patient_id: cleanPatientRecord(patientId),
    year: Number(year),
    month: Number(month)
  };

  if (!isValidPatientRecord(payload.patient_id)
      || !Number.isInteger(payload.year)
      || !Number.isInteger(payload.month)
      || payload.month < 1
      || payload.month > 12) {
    const error = new Error('Invalid monthly summary request.');
    error.code = 'invalid-request';
    throw error;
  }

  const response = await fetch(journalMonthlySummaryUrl, {
    method: 'POST',
    headers: {
      ...journalRequestHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let data = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    // A Django/ngrok text response is handled below as an unavailable service.
  }

  if (!response.ok) {
    const error = new Error('The monthly summary service is unavailable.');
    error.code = response.status >= 500 ? 'server-error' : 'request-error';
    error.status = response.status;

    // Django currently raises KeyError: 'year' after receiving the valid JSON
    // payload. Keep this marker for diagnostics without exposing the traceback.
    if (response.status === 500 && /KeyError[\s\S]{0,250}["']year["']/i.test(responseText)) {
      error.code = 'backend-period-state';
    }
    throw error;
  }

  if (!data || typeof data !== 'object') {
    const error = new Error('The server returned an unexpected response.');
    error.code = 'unexpected-response';
    throw error;
  }

  return data;
}

function monthlySummaryRequest(patientId, request) {
  const existingRequest = monthlySummaryRequests.get(request.requestKey);
  if (existingRequest) return existingRequest;

  const pendingRequest = fetchMonthlySummary(patientId, request.year, request.month)
    .finally(() => {
      if (monthlySummaryRequests.get(request.requestKey) === pendingRequest) {
        monthlySummaryRequests.delete(request.requestKey);
      }
    });
  monthlySummaryRequests.set(request.requestKey, pendingRequest);
  return pendingRequest;
}

async function loadMonthlyShareSummary(host, request) {
  const patientId = cleanPatientRecord(savedPatientId || patientIdInput?.value);
  if (!isValidPatientRecord(patientId)) {
    renderMonthlySummaryState(host, 'invalid-id', () => {
      closeShareCard();
      closeJournal();
      setMenu(true);
    });
    return;
  }

  renderMonthlySummaryState(host, 'loading');

  try {
    const response = await monthlySummaryRequest(patientId, request);
    if (!shareCardOverlay.classList.contains('is-open')
        || !host.isConnected
        || activeShareRange?.requestKey !== request.requestKey) return;
    const summary = typeof response?.ai_response === 'string' ? response.ai_response.trim() : '';
    if (!summary) {
      renderMonthlySummaryState(host, 'empty', () => loadMonthlyShareSummary(host, request));
      return;
    }
    activeShareRange.aiSummary = summary;
    activeShareRange.sharedSummary = summary;
    renderMonthlySummary(host, summary);
  } catch (error) {
    if (!shareCardOverlay.classList.contains('is-open')
        || !host.isConnected
        || activeShareRange?.requestKey !== request.requestKey) return;
    // Keep technical backend details out of the patient-facing Share Card.
    // This code is still useful when diagnosing the API in browser devtools.
    console.warn('Monthly summary unavailable', { code: error?.code, status: error?.status });
    renderMonthlySummaryState(host, 'error', () => loadMonthlyShareSummary(host, request));
  }
}

function openShareCard() {
  if (shareCardOverlay.classList.contains('is-open')) return;
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 27);
  const startDate = toDateKey(rangeStart);
  const endDate = toDateKey(now);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthNumber = String(month).padStart(2, '0');
  const periodLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
  const requestKey = `${cleanPatientRecord(savedPatientId || patientIdInput?.value)}:${year}-${monthNumber}`;
  activeShareRange = { year, month, periodLabel, requestKey, startDate, endDate, aiSummary: '', sharedSummary: '' };
  shareCardContent.replaceChildren();

  const period = document.createElement('section'); period.className = 'share-period';
  const periodKicker = document.createElement('small'); periodKicker.textContent = 'LAST 4 WEEKS';
  const periodTitle = document.createElement('h3'); periodTitle.textContent = `${rangeStart.toLocaleDateString([], { day:'numeric', month:'short' })} – ${now.toLocaleDateString([], { day:'numeric', month:'short', year:'numeric' })}`;
  const periodCopy = document.createElement('p'); periodCopy.textContent = 'Choose any period up to four weeks for the clinician preview.';
  const rangePicker = document.createElement('div'); rangePicker.className = 'share-range-picker';
  const startLabel = document.createElement('label'); startLabel.textContent = 'From';
  const startInput = document.createElement('input'); startInput.type = 'date'; startInput.value = startDate; startInput.max = endDate; startLabel.append(startInput);
  const rangeArrow = document.createElement('span'); rangeArrow.textContent = 'to';
  const endLabel = document.createElement('label'); endLabel.textContent = 'To';
  const endInput = document.createElement('input'); endInput.type = 'date'; endInput.value = endDate; endInput.max = endDate; endLabel.append(endInput);
  rangePicker.append(startLabel, rangeArrow, endLabel);
  const rangeHelp = document.createElement('small'); rangeHelp.className = 'share-range-help'; rangeHelp.textContent = 'Maximum range: 28 days.';
  period.append(periodKicker, periodTitle, periodCopy, rangePicker, rangeHelp); shareCardContent.append(period);

  const monthlySection = document.createElement('section'); monthlySection.className = 'share-section share-monthly-summary';
  const monthlyTitle = document.createElement('h3'); monthlyTitle.textContent = 'AI Summary';
  const monthlyBody = document.createElement('div'); monthlyBody.className = 'monthly-summary-body'; monthlyBody.setAttribute('aria-live', 'polite');
  monthlySection.append(monthlyTitle, monthlyBody); shareCardContent.append(monthlySection);
  // Approval and the existing QR belong to the same continuous document as
  // the summary, rather than a detached fixed footer.
  shareCardContent.append(shareCardReview);
  renderMonthlySummaryState(monthlyBody, 'loading');

  shareApproval.checked = false;
  shareCardQr.replaceChildren(createShareQr());
  shareCardOverlay.classList.add('is-open');
  shareCardOverlay.setAttribute('aria-hidden', 'false');
  document.querySelector('#share-card-close').focus();
  loadMonthlyShareSummary(monthlyBody, { year, month, requestKey });

  const updateRange = () => {
    let selectedStart = new Date(`${startInput.value}T12:00:00`);
    let selectedEnd = new Date(`${endInput.value}T12:00:00`);
    if (Number.isNaN(selectedStart.getTime()) || Number.isNaN(selectedEnd.getTime())) return;
    if (selectedStart > selectedEnd) selectedStart = new Date(selectedEnd);
    const earliest = new Date(selectedEnd); earliest.setDate(earliest.getDate() - 27);
    if (selectedStart < earliest) selectedStart = earliest;
    startInput.value = toDateKey(selectedStart);
    startInput.max = toDateKey(selectedEnd);
    activeShareRange.startDate = startInput.value;
    activeShareRange.endDate = endInput.value;
    periodTitle.textContent = `${selectedStart.toLocaleDateString([], { day:'numeric', month:'short' })} – ${selectedEnd.toLocaleDateString([], { day:'numeric', month:'short', year:'numeric' })}`;
    const selectedYear = selectedEnd.getFullYear();
    const selectedMonth = selectedEnd.getMonth() + 1;
    const selectedMonthNumber = String(selectedMonth).padStart(2, '0');
    const selectedRequestKey = `${cleanPatientRecord(savedPatientId || patientIdInput?.value)}:${selectedYear}-${selectedMonthNumber}`;
    activeShareRange.year = selectedYear;
    activeShareRange.month = selectedMonth;
    activeShareRange.requestKey = selectedRequestKey;
    activeShareRange.periodLabel = periodTitle.textContent;
    activeShareRange.aiSummary = '';
    activeShareRange.sharedSummary = '';
    loadMonthlyShareSummary(monthlyBody, { year:selectedYear, month:selectedMonth, requestKey:selectedRequestKey });
  };
  startInput.addEventListener('change', updateRange);
  endInput.addEventListener('change', updateRange);
}

function closeShareCard() {
  document.querySelector('#journal-share').focus();
  shareCardOverlay.classList.remove('is-open');
  shareCardOverlay.setAttribute('aria-hidden', 'true');
}

function shareJournal() { openShareCard(); }

document.querySelector('.journal-card').addEventListener('click', openJournal);
document.querySelector('#journal-close').addEventListener('click', closeJournal);
document.querySelector('.journal-backdrop').addEventListener('click', closeJournal);
document.querySelector('#day-back').addEventListener('click', () => {
  if (journalNavigation.mode === 'detail' && journalNavigation.detailReturn === 'day') {
    const dateKey = journalNavigation.dateKey;
    renderDayView(dateKey);
    if (!dailySummaryCache.has(dateKey)) loadDailyAnalysis(dateKey);
    return;
  }
  const returnMonth = (journalNavigation.dateKey || toDateKey()).slice(0, 7);
  journalNavigation = { mode: 'calendar', dateKey: '', detailReturn: 'calendar' };
  journalDayView.hidden = true; journalMonthView.hidden = false;
  window.requestAnimationFrame(() => scrollToMonth(returnMonth, 'auto'));
});
calendarTodayButton.addEventListener('click', () => openDayView(toDateKey()));
calendarFilterButtons.forEach((button) => button.addEventListener('click', () => setCalendarFilter(button.dataset.calendarFilter)));
document.querySelector('#journal-share').addEventListener('click', shareJournal);
document.querySelector('#share-card-close').addEventListener('click', closeShareCard);
document.querySelector('.share-card-backdrop').addEventListener('click', closeShareCard);
shareApproval.addEventListener('change', () => showToast(shareApproval.checked ? 'Share Card approved for this preview' : 'Approval removed'));

/* ---------- Patient profile ---------- */
const patientForm = document.querySelector('#patient-form');
const patientNameInput = document.querySelector('#patient-name');
const patientAgeInput = document.querySelector('#patient-age');
const patientIdInput = document.querySelector('#patient-id');
const patientConditionInput = document.querySelector('#patient-condition');
const conditionDetails = document.querySelector('#condition-details');
const conditionLocationInput = document.querySelector('#condition-location');
const conditionNarrowingInput = document.querySelector('#condition-narrowing');
const conditionSurgeryInput = document.querySelector('#condition-surgery');
const patientStatusInput = document.querySelector('#patient-status');
const allergiesInput = document.querySelector('#patient-allergies');
const medicinesInput = document.querySelector('#patient-medicines');
const allergyConfirmations = document.querySelector('#allergy-confirmations');
const medicineConfirmations = document.querySelector('#medicine-confirmations');
const weeklyGoalInput = document.querySelector('#weekly-goal-input');
const visibilityInput = document.querySelector('#profile-visibility');
const visibilityHint = document.querySelector('#visibility-hint');
const caregiverList = document.querySelector('#caregiver-list');
const addCaregiverButton = document.querySelector('#add-caregiver');
const caregiverCount = document.querySelector('#caregiver-count');
const goalNudge = document.querySelector('#goal-nudge');
const profileSaveResult = document.querySelector('#profile-save-result');
const saveProfileButton = patientForm.querySelector('.save-profile');
const patientSummary = document.querySelector('#patient-summary');
const patientStorageKey = 'heard-patient-settings';
let allergyCandidates = [];
let medicineCandidates = [];
let caregivers = [];
let flareGoalNudgeDismissed = false;

const conditionLabels = { UC: 'UC', "Crohn's": 'Crohn’s', 'Not classified': 'not classified', 'Not sure': 'not sure' };
const goalConfig = {
  weekly_1: { goal: 1, period: 'week' }, weekly_3: { goal: 3, period: 'week' }, weekly_5: { goal: 5, period: 'week' },
  monthly_2: { goal: 2, period: 'month' }, monthly_1: { goal: 1, period: 'month' }
};

function updatePatientSummary(name, condition, age = '') {
  const details = [name || 'Evan'];
  if (age !== '') details.push(`${age} years`);
  if (condition) details.push(conditionLabels[condition] || condition);
  patientSummary.textContent = details.join(' · ');
}

function clinicLinkValue(...keys) {
  const params = new URLSearchParams(window.location.search);
  return keys.map((key) => params.get(key)).find((value) => value !== null && value !== '') || '';
}

function syncConditionDetails() {
  conditionDetails.hidden = !["Crohn's", 'Not classified'].includes(patientConditionInput.value);
}

function syncAudienceAndVisibility() {
  const age = Number(patientAgeInput.value);
  const isChild = patientAgeInput.value !== '' && Number.isFinite(age) && age < 18;
  document.documentElement.dataset.audience = isChild ? 'child' : 'adult';
  visibilityInput.disabled = isChild;
  visibilityInput.setAttribute('aria-readonly', String(isChild));
  visibilityHint.textContent = isChild
    ? 'For a child Champion, caregiver access is managed here.'
    : '';
}

function renderCaregivers() {
  caregiverList.replaceChildren();
  caregivers.slice(0, 2).forEach((caregiver, index) => {
    const card = document.createElement('section'); card.className = 'caregiver-card';
    const heading = document.createElement('h3'); heading.textContent = `Caregiver ${index + 1}`;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-caregiver'; remove.setAttribute('aria-label', `Remove caregiver ${index + 1}`); remove.textContent = '×';
    remove.addEventListener('click', () => { caregivers.splice(index, 1); renderCaregivers(); });
    const nameLabel = document.createElement('label'); nameLabel.innerHTML = '<span>Name</span>';
    const name = document.createElement('input'); name.type = 'text'; name.required = true; name.maxLength = 60; name.autocomplete = 'name'; name.placeholder = 'Caregiver name'; name.value = caregiver.name || '';
    name.addEventListener('input', () => { caregivers[index].name = name.value; }); nameLabel.append(name);
    const relationshipLabel = document.createElement('label'); relationshipLabel.innerHTML = '<span>Relationship</span>';
    const relationship = document.createElement('select');
    ['', 'Parent', 'Guardian', 'Partner', 'Family member', 'Other'].forEach((value) => { const option=document.createElement('option'); option.value=value; option.textContent=value || 'Choose'; relationship.append(option); });
    relationship.value = caregiver.relationship || ''; relationship.required = true; relationship.addEventListener('change', () => { caregivers[index].relationship = relationship.value; }); relationshipLabel.append(relationship);
    const emailLabel = document.createElement('label'); emailLabel.innerHTML = '<span>Email for their account</span>';
    const email = document.createElement('input'); email.type = 'email'; email.required = true; email.autocomplete = 'email'; email.placeholder = 'name@example.com'; email.value = caregiver.email || '';
    email.addEventListener('input', () => { caregivers[index].email = email.value; }); emailLabel.append(email);
    card.append(heading, remove, nameLabel, relationshipLabel, emailLabel); caregiverList.append(card);
  });
  addCaregiverButton.disabled = caregivers.length >= 2;
  addCaregiverButton.hidden = caregivers.length >= 2;
  caregiverCount.textContent = `${caregivers.length} of 2 caregivers added`;
}

addCaregiverButton.addEventListener('click', () => {
  if (caregivers.length >= 2) return;
  caregivers.push({ name: '', relationship: '', email: '' }); renderCaregivers();
  caregiverList.lastElementChild?.querySelector('input')?.focus();
});

function selectedEatingPatterns() {
  return [...document.querySelectorAll('#eating-patterns input:checked')].map((input) => input.value);
}

function setEatingPatterns(values = []) {
  document.querySelectorAll('#eating-patterns input').forEach((input) => {
    input.checked = values.includes(input.value);
  });
}

function fallbackInterpret(kind, text) {
  const terms = text.split(/,|\band\b|\n/gi).map((term) => term.trim()).filter(Boolean);
  if (kind === 'allergies') {
    return terms.map((term) => {
      const lower = term.toLowerCase();
      if (/milk|dairy/.test(lower)) return { label: 'Milk protein', code: 'milk_protein', confirmed: false };
      if (/shellfish|prawn|shrimp|crab|lobster/.test(lower)) return { label: 'Shellfish', code: 'shellfish', confirmed: false };
      return { label: term.replace(/\b\w/g, (letter) => letter.toUpperCase()), code: lower.replace(/\W+/g, '_'), confirmed: false };
    });
  }

  const prescribed = /mesalazine|mesalamine|azathioprine|infliximab|adalimumab|ustekinumab|vedolizumab|prednisolone/i;
  const supplement = /vitamin|iron|calcium|probiotic|supplement/i;
  const tcm = /tcm|traditional chinese|herbal/i;
  return terms.map((term) => {
    const isNsaid = /ibuprofen|naproxen|diclofenac|aspirin/i.test(term);
    let category = isNsaid ? 'OTC' : prescribed.test(term) ? 'prescribed' : supplement.test(term) ? 'supplement' : tcm.test(term) ? 'TCM' : 'unrecognised';
    return { label: term, category, pharmacist: isNsaid, confirmed: false };
  });
}

async function interpretProfileText(kind, text) {
  try {
    const response = await fetch(profileInterpretEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_record: savedPatientId || null, field: kind, text })
    });
    if (!response.ok) throw new Error('Interpreter unavailable');
    const data = await response.json();
    const values = data.items || data[kind];
    if (!Array.isArray(values)) throw new Error('Invalid interpreter response');
    return values.map((item) => typeof item === 'string' ? { label: item, code: item.toLowerCase().replace(/\W+/g, '_'), confirmed: false } : { ...item, confirmed: false });
  } catch {
    // Deterministic fallback keeps confirmation gates safe when the normaliser is temporarily offline.
    return fallbackInterpret(kind, text);
  }
}

function renderConfirmations(kind) {
  const isAllergy = kind === 'allergies';
  const container = isAllergy ? allergyConfirmations : medicineConfirmations;
  const candidates = isAllergy ? allergyCandidates : medicineCandidates;
  container.replaceChildren();
  if (!candidates.length) return;

  const prompt = document.createElement('p');
  prompt.className = 'confirm-prompt';
  prompt.textContent = isAllergy ? 'We read that as:' : 'Please confirm how we read these:';
  container.append(prompt);

  candidates.forEach((candidate, index) => {
    const card = document.createElement('div');
    card.className = 'confirm-card';
    if (isAllergy && candidate.confirmed) card.classList.add('is-confirmed-allergy');
    if (candidate.pharmacist) card.classList.add('is-pharmacist');
    const category = !isAllergy ? `${candidate.category || 'unrecognised'}${candidate.pharmacist ? ' · pharmacist review' : ''}` : 'Right?';
    const label = document.createElement('strong');
    label.textContent = candidate.label;
    const detail = document.createElement('small');
    detail.textContent = category;
    card.append(label, detail);
    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.textContent = candidate.confirmed ? 'Confirmed ✓' : 'Yes';
    yes.addEventListener('click', () => { candidates[index].confirmed = true; renderConfirmations(kind); });
    const edit = document.createElement('button');
    edit.type = 'button'; edit.textContent = 'Edit';
    edit.addEventListener('click', () => {
      candidates.splice(index, 1);
      renderConfirmations(kind);
      (isAllergy ? allergiesInput : medicinesInput).focus();
    });
    actions.append(yes, edit); card.append(actions); container.append(card);
  });
}

async function reviewProfileText(kind) {
  const input = kind === 'allergies' ? allergiesInput : medicinesInput;
  const button = document.querySelector(kind === 'allergies' ? '#review-allergies' : '#review-medicines');
  const text = input.value.trim();
  if (!text) {
    if (kind === 'allergies') allergyCandidates = []; else medicineCandidates = [];
    renderConfirmations(kind);
    return;
  }
  button.disabled = true; button.textContent = 'Reading…';
  const items = await interpretProfileText(kind, text);
  if (kind === 'allergies') allergyCandidates = items; else medicineCandidates = items;
  renderConfirmations(kind);
  button.disabled = false; button.textContent = 'Review';
}

function syncGoalNudge() {
  const isMonthly = weeklyGoalInput.value.startsWith('monthly_');
  goalNudge.hidden = patientStatusInput.value !== 'Flaring' || !isMonthly || flareGoalNudgeDismissed;
}

function applyGoalSetting(value) {
  const config = goalConfig[value] || goalConfig.weekly_3;
  weeklyGoal = config.goal;
  renderWeeklyTracker();
}

function loadPatientSettings() {
  let saved = null;
  try {
    saved = JSON.parse(window.localStorage.getItem(patientStorageKey));
  } catch {
    saved = null;
  }

  const linkId = cleanPatientRecord(clinicLinkValue('patient_record', 'user_id', 'id'));
  savedPatientId = isValidPatientRecord(linkId) ? linkId : cleanPatientRecord(saved?.patientId);
  if (!isValidPatientRecord(savedPatientId)) savedPatientId = '';
  patientIdInput.value = savedPatientId;

  if (!saved) {
    patientNameInput.value = 'Evan';
    caregivers = [];
    visibilityInput.value = clinicLinkValue('visibility') || 'just_me';
    syncConditionDetails(); syncAudienceAndVisibility(); syncGoalNudge();
    renderCaregivers();
    updatePatientSummary('Evan', '', '');
    applyGoalSetting('weekly_3');
    return;
  }
  patientNameInput.value = !saved.name || saved.name === 'Shervin' ? 'Evan' : saved.name;
  patientAgeInput.value = saved.age ?? '';
  const migratedCondition = {
    'Ulcerative colitis': 'UC',
    'Crohn’s disease': "Crohn's",
    "Crohn's disease": "Crohn's",
    'Indeterminate colitis': 'Not classified',
    'Not specified': ''
  }[saved.condition] ?? saved.condition ?? '';
  patientConditionInput.value = migratedCondition;
  conditionLocationInput.value = saved.condition_location || '';
  conditionNarrowingInput.value = saved.narrowing || '';
  conditionSurgeryInput.value = saved.surgery || '';
  patientStatusInput.value = saved.status || '';
  allergiesInput.value = saved.allergies_text || '';
  medicinesInput.value = saved.medicines_text || '';
  allergyCandidates = Array.isArray(saved.allergies) ? saved.allergies : [];
  medicineCandidates = Array.isArray(saved.medicines) ? saved.medicines : [];
  setEatingPatterns(saved.eating_patterns || []);
  const legacyGoal = Number(saved.weeklyGoal);
  const checkInGoal = saved.check_in_goal || (legacyGoal === 5 ? 'weekly_5' : legacyGoal === 1 ? 'weekly_1' : 'weekly_3');
  weeklyGoalInput.value = goalConfig[checkInGoal] ? checkInGoal : 'weekly_3';
  visibilityInput.value = clinicLinkValue('visibility') || saved.visibility || 'just_me';
  flareGoalNudgeDismissed = Boolean(saved.monthly_flare_nudge_seen);
  caregivers = Array.isArray(saved.caregivers) ? saved.caregivers.slice(0, 2) : [];
  syncConditionDetails(); syncAudienceAndVisibility(); syncGoalNudge();
  renderConfirmations('allergies'); renderConfirmations('medicines');
  applyGoalSetting(weeklyGoalInput.value);
  renderCaregivers();
  updatePatientSummary(patientNameInput.value, migratedCondition, saved.age ?? '');
}

document.querySelector('#review-allergies').addEventListener('click', () => reviewProfileText('allergies'));
document.querySelector('#review-medicines').addEventListener('click', () => reviewProfileText('medicines'));
allergiesInput.addEventListener('input', () => { allergyCandidates = []; allergyConfirmations.replaceChildren(); });
medicinesInput.addEventListener('input', () => { medicineCandidates = []; medicineConfirmations.replaceChildren(); });
patientConditionInput.addEventListener('change', syncConditionDetails);
patientAgeInput.addEventListener('input', syncAudienceAndVisibility);
patientStatusInput.addEventListener('change', () => { flareGoalNudgeDismissed = false; syncGoalNudge(); });
weeklyGoalInput.addEventListener('change', () => { flareGoalNudgeDismissed = false; syncGoalNudge(); applyGoalSetting(weeklyGoalInput.value); });
goalNudge.addEventListener('click', (event) => {
  const action = event.target.closest('[data-nudge]')?.dataset.nudge;
  if (!action) return;
  if (action === 'change') { weeklyGoalInput.value = 'weekly_3'; applyGoalSetting('weekly_3'); }
  flareGoalNudgeDismissed = true; syncGoalNudge();
});

patientForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  profileSaveResult.className = 'profile-save-result';
  profileSaveResult.textContent = '';
  const patientId = cleanPatientRecord(patientIdInput.value);
  if (!isValidPatientRecord(patientId)) {
    profileSaveResult.classList.add('is-error');
    profileSaveResult.textContent = 'Please enter the complete 36-character Champion ID supplied by the clinic.';
    patientIdInput.focus();
    return;
  }

  if (allergiesInput.value.trim() && !allergyCandidates.length) { await reviewProfileText('allergies'); profileSaveResult.classList.add('is-error'); profileSaveResult.textContent = 'Please confirm the allergy chips, then save again.'; return; }
  if (medicinesInput.value.trim() && !medicineCandidates.length) { await reviewProfileText('medicines'); profileSaveResult.classList.add('is-error'); profileSaveResult.textContent = 'Please confirm the medicine chips, then save again.'; return; }
  if (allergyCandidates.some((item) => !item.confirmed) || medicineCandidates.some((item) => !item.confirmed)) {
    profileSaveResult.classList.add('is-error');
    profileSaveResult.textContent = 'Please confirm every allergy and medicine chip before saving.';
    return;
  }

  const age = patientAgeInput.value === '' ? null : Number(patientAgeInput.value);
  const settings = {
    name: patientNameInput.value.trim(),
    patientId,
    condition: patientConditionInput.value,
    condition_location: conditionDetails.hidden ? '' : conditionLocationInput.value,
    narrowing: conditionDetails.hidden ? '' : conditionNarrowingInput.value,
    surgery: conditionDetails.hidden ? '' : conditionSurgeryInput.value,
    status: patientStatusInput.value,
    age,
    audience: age !== null && age < 18 ? 'child' : age === null ? null : 'adult',
    allergies_text: allergiesInput.value.trim(),
    allergies: allergyCandidates.map(({ label, code }) => ({ label, code, confirmed: true })),
    medicines_text: medicinesInput.value.trim(),
    medicines: medicineCandidates.map(({ label, category, pharmacist }) => ({ label, category, pharmacist: Boolean(pharmacist), confirmed: true })),
    eating_patterns: selectedEatingPatterns(),
    check_in_goal: weeklyGoalInput.value,
    visibility: visibilityInput.value,
    caregivers: caregivers.map((caregiver) => ({ name: caregiver.name.trim(), relationship: caregiver.relationship, email: caregiver.email.trim() })),
    monthly_flare_nudge_seen: flareGoalNudgeDismissed
  };

  const payload = {
    patient_record: patientId,
    profile: { ...settings, patientId: undefined },
    food_gates: {
      condition: settings.condition || null,
      condition_location: settings.condition_location || null,
      narrowing: settings.narrowing || null,
      surgery: settings.surgery || null,
      status: settings.status || null,
      confirmed_allergens: settings.allergies.map((item) => item.code),
      medicines: settings.medicines,
      eating_patterns: settings.eating_patterns,
      visibility: settings.visibility,
      assessment_default: 'NOT_ASSESSED'
    }
  };

  saveProfileButton.disabled = true; saveProfileButton.textContent = 'Saving…';
  try {
    const response = await fetch(profileEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Profile save failed (${response.status})`);
    // Cache the last server-confirmed profile so the form can be restored, never as a substitute for POST.
    window.localStorage.setItem(patientStorageKey, JSON.stringify(settings));
    savedPatientId = patientId;
    patientIdInput.value = patientId;
    applyGoalSetting(settings.check_in_goal);
    updatePatientSummary(settings.name, settings.condition, settings.age ?? '');
    const readAs = [conditionLabels[settings.condition], settings.condition_location?.toLowerCase(), settings.status?.toLowerCase(), settings.allergies.length ? `allergies: ${settings.allergies.map((item) => item.label.toLowerCase()).join(', ')}` : ''].filter(Boolean);
    const blankGateRows = [settings.condition, settings.status].filter((value) => !value).length;
    profileSaveResult.textContent = readAs.length
      ? `Your food scans will now read you as: ${readAs.join(' · ')}.${blankGateRows ? ` ${blankGateRows} left blank. Blank means the app says less, never more.` : ''}`
      : `${blankGateRows} left blank. Blank means the app says less, never more.`;
    showToast('Champion profile saved securely');
  } catch (error) {
    profileSaveResult.classList.add('is-error');
    profileSaveResult.textContent = 'We could not save this Champion profile. Nothing was changed—please try again.';
    console.error(error);
  } finally {
    saveProfileButton.disabled = false; saveProfileButton.textContent = 'Save Champion profile';
  }
});

/* ---------- Room game ---------- */
const objectSheet = document.querySelector('#object-sheet');
const objectSheetContent = document.querySelector('#object-sheet-content');
const objectSheetBackdrop = document.querySelector('#object-sheet-backdrop');
const roomCount = document.querySelector('#room-count');
const roomCheckin = document.querySelector('#room-checkin');
const roomXp = document.querySelector('#room-xp');
const gameApiResponse = document.querySelector('#game-api-response');
let roomDate = toDateKey();
let roomStorageKey = `heard-room-${roomDate}`;
let roomXpValue = Math.max(0, Number(localStorage.getItem('heard-room-xp')) || 40);
let roomState = {};
let gameSheetTrigger = null;
try { roomState = JSON.parse(localStorage.getItem(roomStorageKey)) || {}; } catch { roomState = {}; }

const participationXpStorageKey = 'heard-participation-xp-awards';

function awardParticipationXp(actionKey, amount, toastLabel = '') {
  let awards = {};
  try { awards = JSON.parse(localStorage.getItem(participationXpStorageKey)) || {}; } catch { awards = {}; }
  const datedActionKey = `${toDateKey()}:${actionKey}`;
  if (awards[datedActionKey]) return false;

  awards[datedActionKey] = { amount, awarded_at: new Date().toISOString() };
  localStorage.setItem(participationXpStorageKey, JSON.stringify(awards));
  roomXpValue = Math.min(500, roomXpValue + amount);
  saveRoomState();
  renderRoomState();
  if (toastLabel) showToast(`${toastLabel} · +${amount} XP`);
  return true;
}

function cachedProfile() {
  try { return JSON.parse(localStorage.getItem(patientStorageKey)) || {}; } catch { return {}; }
}

function saveRoomState() {
  localStorage.setItem(roomStorageKey, JSON.stringify(roomState));
  localStorage.setItem('heard-room-xp', String(roomXpValue));
}

function gameTileSummary(tile, payload) {
  if (!payload) return 'Not entered';
  if (tile === 'wellbeing') return `${payload.energy} energy · ${String(payload.sleep).replaceAll('_', ' ')} sleep`;
  if (tile === 'stools') return `Type ${payload.bristol} · ${String(payload.blood || 'no blood').replaceAll('_', ' ')}`;
  if (tile === 'pain') return `${payload.score} / 10`;
  if (tile === 'meds') {
    const taken = payload.doses.filter((dose) => dose.status === 'taken').length;
    const missed = payload.doses.filter((dose) => dose.status === 'missed').length;
    return `${taken} taken · ${missed} missed`;
  }
  return 'Entered';
}

function roomTilePayload(tile) {
  if (tile === 'wellbeing' && !roomState.wellbeing && (roomState.energy || roomState.sleep)) {
    return {
      tile: 'wellbeing',
      energy: roomState.energy?.energy || 'not logged',
      sleep: roomState.sleep?.sleep || 'not logged',
      woke_to_go: roomState.sleep?.woke_to_go ?? null,
      tags: roomState.energy?.tags || []
    };
  }
  if (tile === 'stools' && roomState.stools && !roomState.stools.blood && roomState.blood) {
    return { ...roomState.stools, blood: roomState.blood.blood };
  }
  return roomState[tile];
}

function renderRoomState() {
  const today = toDateKey();
  if (today !== roomDate) {
    roomDate = today;
    roomStorageKey = `heard-room-${roomDate}`;
    try { roomState = JSON.parse(localStorage.getItem(roomStorageKey)) || {}; } catch { roomState = {}; }
  }
  const complete = ['wellbeing','stools','pain','meds'].filter((tile) => Boolean(roomTilePayload(tile))).length;
  roomCount.textContent = String(complete);
  roomCheckin.textContent = complete >= 4 ? ' · check-in done ✓' : '';
  roomXp.textContent = roomXpValue;
  const levelCard = document.querySelector('.level-card--header');
  if (levelCard) levelCard.setAttribute('aria-label', `Level 3, ${roomXpValue} of 100 XP`);
  gameTiles.forEach((button) => {
    const tile = button.dataset.gameTile;
    const payload = roomTilePayload(tile);
    button.classList.toggle('is-complete', Boolean(payload));
    button.setAttribute('aria-pressed', String(Boolean(payload)));
    button.querySelector('small').textContent = gameTileSummary(tile, payload);
    button.querySelector('i').textContent = payload ? '✓' : '';
  });
}

function sheetHeading(title, subtitle) {
  objectSheetContent.replaceChildren();
  const heading = document.createElement('h2'); heading.id = 'object-sheet-title'; heading.textContent = title;
  const copy = document.createElement('p'); copy.className = 'sheet-subtitle'; copy.textContent = subtitle;
  objectSheetContent.append(heading, copy);
}

function choiceButton(label, value, group, onChoose, extraClass = '') {
  const button = document.createElement('button');
  button.type = 'button'; button.className = `choice-button ${extraClass}`.trim(); button.textContent = label; button.dataset.value = value;
  button.addEventListener('click', () => {
    group.querySelectorAll('.choice-button').forEach((item) => item.classList.remove('is-selected'));
    button.classList.add('is-selected'); onChoose(value, button);
  });
  return button;
}

function toggleButton(label, value, selected, onToggle) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  button.addEventListener('click', () => { const on = !selected.has(value); if (on) selected.add(value); else selected.delete(value); button.classList.toggle('is-selected', on); onToggle?.(on); });
  return button;
}

function confirmGameButton(label, getPayload) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'save-game-response'; button.textContent = label; button.disabled = true;
  button.addEventListener('click', async () => {
    const payload = getPayload();
    if (!payload) return;
    button.disabled = true; button.textContent = 'Saving…';
    const success = await commitGameTile(payload.tile, payload);
    if (!success) { button.disabled = false; button.textContent = label; }
  });
  objectSheetContent.append(button);
  return button;
}

function openWellbeingSheet() {
  sheetHeading('Energy + Sleep', 'Two quick check-ins: your energy today and how you slept last night.');
  let energy = '';
  let sleep = '';
  let wokeToGo = null;
  const confirm = confirmGameButton('Save Energy + Sleep ⭐ +10', () => (
    energy && sleep ? { tile:'wellbeing', energy, sleep, woke_to_go:wokeToGo, tags:[] } : null
  ));
  const updateConfirm = () => { confirm.disabled = !(energy && sleep); };

  const energySection = document.createElement('section'); energySection.className = 'sheet-question';
  const energyTitle = document.createElement('h3'); energyTitle.textContent = 'How is your energy today?';
  const energyChoices = document.createElement('div'); energyChoices.className = 'choice-set choice-set--three';
  [['🔋 Full','good'],['🪫 Half','ok'],['🪫 Empty','low']].forEach(([label,value]) => {
    energyChoices.append(choiceButton(label, value, energyChoices, (chosen) => { energy = chosen; updateConfirm(); }));
  });
  energySection.append(energyTitle, energyChoices);

  const sleepSection = document.createElement('section'); sleepSection.className = 'sheet-question';
  const sleepTitle = document.createElement('h3'); sleepTitle.textContent = 'How was your sleep?';
  const sleepChoices = document.createElement('div'); sleepChoices.className = 'choice-set sleep-quality-set';
  [['Very poor','very_poor'],['Poor','poor'],['Fair','fair'],['Good','good'],['Very good','very_good']].forEach(([label,value]) => {
    sleepChoices.append(choiceButton(label, value, sleepChoices, (chosen) => { sleep = chosen; updateConfirm(); }));
  });
  sleepSection.append(sleepTitle, sleepChoices);

  const wakeSection = document.createElement('section'); wakeSection.className = 'sheet-question sheet-question--optional';
  const wakeTitle = document.createElement('h3'); wakeTitle.textContent = 'Did you wake to use the toilet?';
  const wakeChoices = document.createElement('div'); wakeChoices.className = 'choice-set choice-set--four';
  [['No',0],['Once',1],['Twice',2],['3+',3]].forEach(([label,value]) => {
    wakeChoices.append(choiceButton(label, String(value), wakeChoices, (chosen) => { wokeToGo = Number(chosen); }));
  });
  wakeSection.append(wakeTitle, wakeChoices);

  objectSheetContent.insertBefore(energySection, confirm);
  objectSheetContent.insertBefore(sleepSection, confirm);
  objectSheetContent.insertBefore(wakeSection, confirm);
}

function openEnergySheet() {
  sheetHeading('Energy level', 'How is your energy today?');
  const preview = document.createElement('div'); preview.className = 'sheet-preview'; preview.textContent = '☀️';
  const group = document.createElement('div'); group.className = 'choice-set';
  const tags = new Set(); let energy = '';
  const choices = [['Sunny','good','☀️'],['Cloudy','ok','☁️'],['Rainy','low','🌧️'],['Stormy','low','⛈️']];
  const confirm = confirmGameButton('Save response ⭐ +10', () => energy ? { tile:'energy', energy, tags:[...tags] } : null);
  choices.forEach(([label,value,icon]) => group.append(choiceButton(label, label.toLowerCase(), group, (weather) => { energy = value; preview.dataset.weather = weather; preview.textContent = icon; confirm.disabled = false; })));
  const chips = document.createElement('div'); chips.className = 'toggle-chips'; chips.append(toggleButton('Stressed','stressed',tags), toggleButton('Low mood','low_mood',tags));
  objectSheetContent.insertBefore(preview, confirm); objectSheetContent.insertBefore(group, confirm); objectSheetContent.insertBefore(chips, confirm);
}

function openBloodSheet() {
  sheetHeading('Blood check', 'When you went, was there any blood?');
  const note = document.createElement('p'); note.className = 'sheet-subtitle'; note.textContent = 'Choose the option that best matches what you saw.';
  const group = document.createElement('div'); group.className = 'choice-set'; let blood = '';
  const confirm = confirmGameButton('Save response ⭐ +10', () => blood ? { tile:'blood', blood } : null);
  [['None','none','○'],['Streaks','small_streaks','◔'],['Mixed in','mixed','◑'],['Mostly','mostly','●']].forEach(([label,value,icon]) => group.append(choiceButton(`${icon} ${label}`, value, group, (chosen) => { blood = chosen; confirm.disabled = false; }, 'blood-choice')));
  objectSheetContent.insertBefore(note, confirm); objectSheetContent.insertBefore(group, confirm);
}

function openStoolsSheet() {
  sheetHeading('Poo Parade', 'Choose the Bristol type, then add the blood check for this poo.');
  const group = document.createElement('div'); group.className = 'choice-set bristol-choice-set'; let bristol = 0; let blood = '';
  const tags = new Set();
  const confirm = confirmGameButton('Save Poo Parade ⭐ +10', () => bristol && blood ? { tile:'stools', bristol, blood, urgency:tags.has('urgency'), trips_band:tags.has('more_than_4') ? 'more_than_4' : null } : null);
  const updateConfirm = () => { confirm.disabled = !(bristol && blood); };
  ['Pebbles','Lumpy','Cracked','Smooth','Soft blobs','Mushy','Watery'].forEach((name,index) => {
    const type = index + 1;
    const button = choiceButton(`Type ${type}: ${name}`, String(type), group, (value) => { bristol = Number(value); updateConfirm(); });
    button.classList.add('bristol-choice');
    button.setAttribute('aria-label', `Bristol type ${type}: ${name}`);
    const image = document.createElement('img'); image.src = `./public/bristol/type-${type}.png`; image.alt = ''; image.setAttribute('aria-hidden','true');
    const label = document.createElement('span'); label.textContent = `Type ${type} · ${name}`;
    button.replaceChildren(image, label); group.append(button);
  });
  const bristolSection = document.createElement('section'); bristolSection.className = 'sheet-question';
  const bristolTitle = document.createElement('h3'); bristolTitle.textContent = 'What did it look like?';
  bristolSection.append(bristolTitle, group);
  const chips = document.createElement('div'); chips.className = 'toggle-chips'; chips.append(toggleButton('Had to rush 💨','urgency',tags), toggleButton('More than 4 times','more_than_4',tags));
  const detailsSection = document.createElement('section'); detailsSection.className = 'sheet-question sheet-question--optional';
  const detailsTitle = document.createElement('h3'); detailsTitle.textContent = 'Anything else?';
  detailsSection.append(detailsTitle, chips);
  const bloodSection = document.createElement('section'); bloodSection.className = 'sheet-question poo-blood-question';
  const bloodTitle = document.createElement('h3'); bloodTitle.textContent = 'Was there any blood?';
  const bloodChoices = document.createElement('div'); bloodChoices.className = 'choice-set choice-set--four';
  [['No blood','none'],['Streaks','small_streaks'],['Mixed in','mixed'],['Mostly blood','mostly']].forEach(([label,value]) => {
    bloodChoices.append(choiceButton(label, value, bloodChoices, (chosen) => { blood = chosen; updateConfirm(); }, 'blood-choice'));
  });
  bloodSection.append(bloodTitle, bloodChoices);
  objectSheetContent.insertBefore(bristolSection, confirm);
  objectSheetContent.insertBefore(detailsSection, confirm);
  objectSheetContent.insertBefore(bloodSection, confirm);
}

function openSleepSheet() {
  sheetHeading('Sleep', 'Tap the moon once for each time you woke to go.');
  let woke = 0; let quality = null;
  const counter = document.createElement('div'); counter.className = 'wake-counter';
  const moon = document.createElement('button'); moon.type = 'button'; moon.className = 'moon-button'; moon.textContent = '🌙'; moon.setAttribute('aria-label','Add one night wake-up');
  const count = document.createElement('span'); count.className = 'wake-count'; count.textContent = '0 wake-ups';
  moon.addEventListener('click', () => { woke += 1; count.textContent = `${woke} wake-up${woke === 1 ? '' : 's'}`; });
  counter.append(moon,count);
  const qualities = document.createElement('div'); qualities.className = 'toggle-chips';
  const qualitySet = document.createElement('div'); qualitySet.className = 'choice-set';
  qualitySet.hidden = true;
  ['bad','ok','good'].forEach((value) => qualitySet.append(choiceButton(value[0].toUpperCase()+value.slice(1), value, qualitySet, (chosen)=>{ quality=chosen; })));
  const pillow=document.createElement('button');pillow.type='button';pillow.className='choice-button';pillow.textContent='Tap the pillow to add sleep quality';pillow.addEventListener('click',()=>{qualitySet.hidden=!qualitySet.hidden;pillow.textContent=qualitySet.hidden?'Tap the pillow to add sleep quality':'Sleep quality (optional)';});
  const confirm = confirmGameButton('Save response ⭐ +10', () => ({ tile:'sleep', woke_to_go:woke, sleep:quality })); confirm.disabled = false;
  const slept = document.createElement('button'); slept.type='button'; slept.className='save-game-response'; slept.textContent='Slept through 🎉'; slept.addEventListener('click',()=>commitGameTile('sleep',{tile:'sleep',woke_to_go:0,sleep:quality}));
  objectSheetContent.insertBefore(counter, confirm); objectSheetContent.insertBefore(pillow, confirm); objectSheetContent.insertBefore(qualitySet, confirm); objectSheetContent.append(slept);
}

function configuredDoses() {
  const medicines = cachedProfile().medicines || [];
  const names = medicines.filter((item) => item.confirmed !== false).map((item) => item.label).slice(0,2);
  return [{slot:'morning',name:names[0] || 'Tummy Shield'},{slot:'evening',name:names[1] || names[0] || 'Tummy Shield'}];
}

function openMedsSheet() {
  sheetHeading('Medicine Time', 'For each scheduled time, choose Taken, Missed, or Not yet.');
  const answers = new Map(); const list = document.createElement('div'); list.className='med-adherence-list';
  const activeAnswers = () => [...answers.values()].filter((dose) => dose.status === 'taken' || dose.status === 'missed');
  const confirm = confirmGameButton('Save medicine check-in ⭐ +10', () => activeAnswers().length ? {tile:'meds',doses:[...answers.values()]} : null);
  const updateConfirm = () => { confirm.disabled = activeAnswers().length === 0; };
  configuredDoses().forEach((dose)=>{
    const card=document.createElement('section'); card.className='med-adherence-card';
    const heading=document.createElement('div'); heading.className='med-adherence-heading';
    const name=document.createElement('strong'); name.textContent=`💊 ${dose.name}`;
    const slot=document.createElement('span'); slot.textContent=dose.slot; heading.append(name,slot);
    const statusChoices=document.createElement('div'); statusChoices.className='choice-set med-status-set';
    const reasonWrap=document.createElement('div'); reasonWrap.className='med-reason-wrap'; reasonWrap.hidden=true;
    const reasons=document.createElement('div'); reasons.className='choice-set med-reason-set';
    const answer={...dose,status:'not_logged',reason:null}; answers.set(dose.slot,answer);
    [['Taken','taken'],['Missed','missed'],['Not yet','not_logged']].forEach(([label,value])=>{
      statusChoices.append(choiceButton(label,value,statusChoices,(chosen)=>{
        answer.status=chosen; if(chosen!=='missed') answer.reason=null;
        reasonWrap.hidden=chosen!=='missed'; updateConfirm();
      }));
    });
    const reasonTitle=document.createElement('small'); reasonTitle.textContent='What got in the way? (optional)';
    [['Forgot','forgot'],['Felt sick after','felt_sick_after'],['Ran out','ran_out'],['Felt well','felt_well'],['Other','other']].forEach(([label,value])=>{
      reasons.append(choiceButton(label,value,reasons,(chosen)=>{answer.reason=chosen;}));
    });
    reasonWrap.append(reasonTitle,reasons); card.append(heading,statusChoices,reasonWrap); list.append(card);
  });
  objectSheetContent.insertBefore(list,confirm);
}

function openPainSheet() {
  sheetHeading('Pain', 'Tap where it hurts, choose a face, then add any timing that fits.');
  const locations=new Set();const timing=new Set();let score=null;
  const body=document.createElement('div');body.className='body-map';
  ['top of tummy','right side','around belly button','left side','low down','bottom','head'].forEach((zone)=>body.append(toggleButton(zone,zone,locations)));
  const bodySection=document.createElement('section');bodySection.className='sheet-question sheet-question--optional';
  const bodyTitle=document.createElement('h3');bodyTitle.textContent='Where does it hurt?';bodySection.append(bodyTitle,body);
  const faces=document.createElement('div');faces.className='choice-set pain-face-set';
  const confirm=confirmGameButton('Save response ⭐ +10',()=>score!==null?{tile:'pain',score,scale:'fps_r',locations:[...locations],timing:[...timing]}:null);
  [['No hurt',0],['Hurts a little',2],['Hurts a bit more',4],['Hurts even more',6],['Hurts a lot',8],['Hurts worst',10]].forEach(([label,value],index)=>{
    const button=choiceButton(label,String(value),faces,(chosen)=>{score=Number(chosen);confirm.disabled=false;});
    button.classList.add('pain-face-choice'); button.setAttribute('aria-label',label); button.innerHTML=painFaceSvg(index); faces.append(button);
  });
  const faceSection=document.createElement('section');faceSection.className='sheet-question';
  const faceTitle=document.createElement('h3');faceTitle.textContent='Which face feels most like your pain?';faceSection.append(faceTitle,faces);
  const chips=document.createElement('div');chips.className='toggle-chips';['after eating','before poo','better after poo','woke me','at school','all day'].forEach((item)=>chips.append(toggleButton(item,item,timing)));
  const timingSection=document.createElement('section');timingSection.className='sheet-question sheet-question--optional';
  const timingTitle=document.createElement('h3');timingTitle.textContent='When does it happen?';timingSection.append(timingTitle,chips);
  objectSheetContent.insertBefore(bodySection,confirm);objectSheetContent.insertBefore(faceSection,confirm);objectSheetContent.insertBefore(timingSection,confirm);
}

function painFaceSvg(level) {
  const mouth = ['M20 39 Q32 47 44 39','M21 40 Q32 44 43 40','M21 42 Q32 42 43 42','M20 43 Q32 37 44 43','M19 44 Q32 35 45 44','M18 46 Q32 32 46 46'][level];
  const brows = level < 2 ? '' : `<path d="M19 ${27-level} L27 ${27+Math.min(level,3)} M45 ${27-level} L37 ${27+Math.min(level,3)}" fill="none" stroke="#26364d" stroke-width="2.4" stroke-linecap="round"/>`;
  const tears = level === 5 ? '<path d="M20 34 Q16 40 20 44 Q24 40 20 34Z M44 34 Q40 40 44 44 Q48 40 44 34Z" fill="#49b9e8"/>' : '';
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="#fff4cf" stroke="#537da2" stroke-width="2.5"/><circle cx="23" cy="31" r="2.7" fill="#26364d"/><circle cx="41" cy="31" r="2.7" fill="#26364d"/>${brows}${tears}<path d="${mouth}" fill="none" stroke="#26364d" stroke-width="2.8" stroke-linecap="round"/></svg>`;
}

function openObjectSheet(tile, trigger = document.activeElement) {
  ({wellbeing:openWellbeingSheet,stools:openStoolsSheet,meds:openMedsSheet,pain:openPainSheet}[tile])?.();
  gameSheetTrigger = trigger;
  objectSheet.dataset.activity = tile;
  appShell.classList.add('has-open-game-sheet');
  appShell.scrollTop = 0;
  objectSheetBackdrop.hidden = false;
  objectSheet.hidden=false;
  document.querySelector('#object-sheet-back').focus({ preventScroll: true });
}

function closeObjectSheet() {
  objectSheet.hidden=true; objectSheetBackdrop.hidden=true; objectSheetContent.replaceChildren();
  delete objectSheet.dataset.activity;
  appShell.classList.remove('has-open-game-sheet');
  appShell.scrollTop = 0;
  const trigger=gameSheetTrigger; gameSheetTrigger=null;
  if(trigger?.isConnected) trigger.focus({ preventScroll: true });
}

function gamePayloadSentence(payload) {
  if (payload.tile === 'wellbeing') {
    const waking = payload.woke_to_go == null ? '' : payload.woke_to_go === 0 ? ' I slept through without waking to use the toilet.' : ` I woke ${payload.woke_to_go} ${payload.woke_to_go === 1 ? 'time' : 'times'} to use the toilet.`;
    return `My energy today is ${payload.energy}, and my sleep last night was ${String(payload.sleep).replaceAll('_', ' ')}.${waking}`;
  }
  if (payload.tile === 'energy') {
    const tags = payload.tags.length ? ` I also feel ${payload.tags.map((tag) => tag.replace('_', ' ')).join(' and ')}.` : '';
    return `My energy level today is ${payload.energy}.${tags}`;
  }
  if (payload.tile === 'blood') {
    const phrase = { none: 'I did not see any blood when I went to the toilet', small_streaks: 'I saw small streaks of blood when I went to the toilet', mixed: 'I saw blood mixed into my stool', mostly: 'What I passed was mostly blood' }[payload.blood];
    return `${phrase}.`;
  }
  if (payload.tile === 'stools') {
    const details = [`My stool was Bristol type ${payload.bristol}`];
    const bloodPhrase = { none:'I saw no blood', small_streaks:'I saw small streaks of blood', mixed:'I saw blood mixed in', mostly:'What I passed was mostly blood' }[payload.blood];
    if (bloodPhrase) details.push(bloodPhrase);
    if (payload.urgency) details.push('I had to rush to the toilet');
    if (payload.trips_band) details.push('I went to the toilet more than 4 times today');
    return `${details.join('. ')}.`;
  }
  if (payload.tile === 'sleep') {
    const waking = payload.woke_to_go === 0 ? 'I slept through without waking to go to the toilet' : `I woke up ${payload.woke_to_go} ${payload.woke_to_go === 1 ? 'time' : 'times'} to go to the toilet`;
    return `${waking}${payload.sleep ? `, and my sleep quality was ${payload.sleep}` : ''}.`;
  }
  if (payload.tile === 'meds') {
    const reasonPhrases = { forgot:' because I forgot', felt_sick_after:' because I felt sick after it', ran_out:' because I ran out', felt_well:' because I felt well', other:'' };
    return payload.doses
      .filter((dose) => dose.status === 'taken' || dose.status === 'missed')
      .map((dose) => dose.status === 'taken'
        ? `I took my ${dose.name} ${dose.slot} medicine.`
        : `I missed my ${dose.name} ${dose.slot} medicine${reasonPhrases[dose.reason] || ''}.`)
      .join(' ');
  }
  if (payload.tile === 'pain') {
    const location = payload.locations.length ? ` The pain is in my ${payload.locations.join(' and ')}.` : '';
    const timing = payload.timing.length ? ` It happens ${payload.timing.join(' and ')}.` : '';
    return `My pain is ${payload.score} out of 10.${location}${timing}`;
  }
  return 'I completed a structured check-in response.';
}

async function sendGamePayload(payload) {
  const patientRecord=getSavedPatientRecord(); if(!patientRecord) throw new Error('Missing patient record');
  const sentence=gamePayloadSentence(payload);
  const response=await fetch(chatEndpoint,{
    method:'POST',
    headers:{Accept:'application/json','Content-Type':'application/json'},
    body:JSON.stringify({
      patient_record:patientRecord,
      conversation_text:sentence,
      response_by:chatResponseBy
    })
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(`Game log failed (${response.status})`);
  return sanitizeHeardResponse(data?.say || data?.ai_response || 'Saved.');
}

function gameEntryFromPayload(payload) {
  if(payload.tile==='wellbeing'){
    addJournalEntry('energy',payload.energy,{source:'quest_tap'});
    addJournalEntry('sleep',{quality:payload.sleep,woke_to_go:payload.woke_to_go},{source:'quest_tap'});
  }
  if(payload.tile==='energy'){addJournalEntry('energy',payload.energy,{source:'quest_tap'});if(payload.tags.includes('low_mood'))addJournalEntry('mood','low',{source:'quest_tap'});}
  if(payload.tile==='blood')addJournalEntry('blood',payload.blood,{source:'quest_tap'});
  if(payload.tile==='stools'){
    addJournalEntry('stool_type',{bristol:payload.bristol,urgency:payload.urgency,trips_band:payload.trips_band},{source:'quest_tap'});
    addJournalEntry('blood',payload.blood,{source:'quest_tap'});
  }
  if(payload.tile==='sleep')addJournalEntry('sleep',{quality:payload.sleep,woke_to_go:payload.woke_to_go},{source:'quest_tap'});
  if(payload.tile==='meds')addJournalEntry('medicine',{name:'Medication',status:'logged',doses:payload.doses},{source:'quest_tap'});
  if(payload.tile==='pain')addJournalEntry('pain',{score:payload.score,scale:payload.scale,locations:payload.locations,timing:payload.timing},{source:'quest_tap'});
}

async function commitGameTile(tile,payload) {
  try {
    await sendGamePayload(payload);
    roomState[tile]=payload;roomXpValue=Math.min(500,roomXpValue+10);saveRoomState();gameEntryFromPayload(payload);closeObjectSheet();renderRoomState();
    gameApiResponse.textContent='Check-in saved.';
    renderWeeklyTracker();showToast(`${tile[0].toUpperCase()+tile.slice(1)} logged`);return true;
  } catch(error){
    gameApiResponse.textContent='This response was not sent. Please check your Champion ID or connection and try again.';
    showToast('Could not save this entry. Please try again.');return false;
  }
}

gameTiles.forEach((button)=>button.addEventListener('click',()=>openObjectSheet(button.dataset.gameTile,button)));
document.querySelector('#object-sheet-back').addEventListener('click',closeObjectSheet);
objectSheetBackdrop.addEventListener('click',closeObjectSheet);
document.addEventListener('keydown',(event)=>{ if(event.key==='Escape'&&!objectSheet.hidden) closeObjectSheet(); });

/* ---------- Initial state ---------- */
document.querySelector('#status-time').textContent = formatTime();
loadPatientSettings();
saveJournalEntries();
renderWeeklyTracker();
renderRoomState();
views.chat.setAttribute('aria-hidden', 'false');
views.game.setAttribute('aria-hidden', 'true');
window.requestAnimationFrame(restoreChatHistorySize);
scrollChatToLatest('auto');
