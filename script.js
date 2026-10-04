'use strict';

const lessons = window.SAFETY_LESSONS || {};
const lessonIds = Object.keys(lessons);
const progressKey = 'sameetSafetyLab.learning.v1';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const dialog = document.querySelector('#lesson-dialog');
const topicGrid = document.querySelector('#topic-grid');
const topicSearch = document.querySelector('#topic-search');
const resultCount = document.querySelector('#topic-results');
const learnSection = document.querySelector('#learn');
const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav-links');
const content = document.querySelector('#lesson-content');
const themeToggle = document.querySelector('#theme-toggle');
const themeIcon = themeToggle.querySelector('.theme-icon');
const themeLabel = themeToggle.querySelector('.theme-label');
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const lessonSearch = document.querySelector('#lesson-search');
const lessonSearchResults = document.querySelector('#lesson-search-results');
const lessonSearchWrap = document.querySelector('#lesson-search-wrap');
let activeFilter = 'All';
let activeLessonId = null;
let lastOpener = null;
let revealObserver = null;
let parallaxFrame = null;
let activePracticeTopic = null;
let activeScenarioIndex = 0;
let selectedScenarioChoice = null;
let practiceTopicFinished = false;
let pendingPracticeLesson = null;
const themeStorageKey = 'sameetSafetyLab.theme.v1';
let activeTheme = 'light';

function applyTheme(theme, persist = false) {
  activeTheme = theme === 'dark' ? 'dark' : 'light';
  const dark = activeTheme === 'dark';
  document.body.classList.toggle('dark-theme', dark);
  themeIcon.textContent = dark ? '☀' : '☾';
  themeLabel.textContent = dark ? 'Light' : 'Dark';
  const action = 'Switch to ' + (dark ? 'light' : 'dark') + ' theme';
  themeToggle.setAttribute('aria-label', action);
  themeToggle.setAttribute('title', action);
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeColorMeta?.setAttribute('content', dark ? '#0c151e' : '#f3f8fa');
  if (persist) {
    try { localStorage.setItem(themeStorageKey, activeTheme); } catch { /* Theme remains available for this page view. */ }
  }
}
let storedTheme = null;
try { storedTheme = localStorage.getItem(themeStorageKey); } catch { /* Use the current light appearance if storage is unavailable. */ }
applyTheme(storedTheme === 'dark' ? 'dark' : 'light');

const practiceTopicLabels = {
  phishing:['🎣','Phishing'],computer:['💻','Computer & Laptop'],mobile:['📱','Mobile Security'],wifi:['📡','Wi-Fi & Hotspot'],publicwifi:['🌐','Public Wi-Fi'],upi:['💳','UPI & Online Scams'],cctv:['📹','CCTV Security'],accounts:['🔐','Account Security'],social:['💬','WhatsApp & Social Media'],sim:['📲','SIM & eSIM'],nfc:['📡','NFC & RFID'],email:['📧','Email Security']
};

const cloneDefault = () => ({completed: [], attempts: {}, lastLesson: null});
function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey) || 'null');
    if (!saved || typeof saved !== 'object') return cloneDefault();
    return {
      completed: Array.isArray(saved.completed) ? saved.completed.filter(id => lessons[id]) : [],
      attempts: saved.attempts && typeof saved.attempts === 'object' ? saved.attempts : {},
      lastLesson: lessons[saved.lastLesson] ? saved.lastLesson : null
    };
  } catch { return cloneDefault(); }
}
let progress = loadProgress();
function saveProgress() {
  try {
    localStorage.setItem(progressKey, JSON.stringify(progress));
    document.querySelector('#save-note').textContent = 'Progress saves on this device.';
  } catch {
    document.querySelector('#save-note').textContent = 'Browser storage is unavailable; progress lasts until this tab closes.';
  }
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function attemptFor(id) {
  const saved = progress.attempts[id];
  if (!saved || typeof saved !== 'object') return {index: 0, phase: 'question', answers: [], review: false};
  return {
    index: Math.max(0, Math.min(Number(saved.index) || 0, lessons[id].quiz.length)),
    phase: ['question','feedback','result'].includes(saved.phase) ? saved.phase : 'question',
    answers: Array.isArray(saved.answers) ? saved.answers.slice(0, lessons[id].quiz.length) : [],
    review: Boolean(saved.review)
  };
}
function saveAttempt(id, attempt) {
  progress.attempts[id] = attempt;
  progress.lastLesson = id;
  if (!progress.attempts[id]) progress.attempts[id] = {index:0, phase:'question', answers:[], review:false};
  saveProgress();
}
function updateProgressDisplay() {
  const total = lessonIds.length;
  const complete = progress.completed.length;
  const percent = total ? Math.round(complete / total * 100) : 0;
  document.querySelector('#progress-copy').textContent = complete + ' of ' + total + ' topics completed';
  document.querySelector('#progress-percent').textContent = percent + '%';
  const bar = document.querySelector('#overall-progress');
  bar.setAttribute('aria-valuemax', String(total));
  bar.setAttribute('aria-valuenow', String(complete));
  document.querySelector('#overall-progress-fill').style.width = percent + '%';
  document.querySelectorAll('[data-topic-count]').forEach(node => { node.textContent = String(total); });
}
function cardMarkup(id, index) {
  const lesson = lessons[id];
  const completed = progress.completed.includes(id);
  const started = Boolean(progress.attempts[id]);
  const action = completed ? 'Review lesson' : started ? 'Continue lesson' : 'Start lesson';
  const cardDelay = Math.min(index, 8) * (window.innerWidth <= 650 ? 35 : 70);
  return '<article class="topic-card' + (completed ? ' is-complete' : '') + '" data-reveal="up" style="--reveal-delay:' + cardDelay + 'ms">' +
    '<div class="topic-card-top"><span class="topic-icon" aria-hidden="true">' + escapeHtml(lesson.icon) + '</span><span class="topic-category">' + escapeHtml(lesson.category) + '</span>' +
    (completed ? '<span class="complete-badge"><span aria-hidden="true">✓</span> Completed</span>' : '') + '</div>' +
    '<h3>' + escapeHtml(lesson.title) + '</h3><p>' + escapeHtml(lesson.description) + '</p>' +
    '<div class="topic-meta"><span>' + escapeHtml(lesson.difficulty) + '</span><span>◷ ' + lesson.minutes + ' min</span></div>' +
    '<button class="topic-start" type="button" data-open-lesson="' + escapeHtml(id) + '">' + action + ' <span aria-hidden="true">→</span></button></article>';
}
function renderHub() {
  const query = topicSearch.value.trim().toLowerCase();
  const filtered = lessonIds.filter(id => {
    const item = lessons[id];
    const matchesFilter = activeFilter === 'All' || item.category === activeFilter;
    const matchesQuery = matchesLessonQuery(item, query);
    return matchesFilter && matchesQuery;
  });
  topicGrid.innerHTML = filtered.length ? filtered.map((id, index) => cardMarkup(id, index)).join('') :
    '<div class="empty-results"><strong>No topics found.</strong><p>Try a different word or choose another category.</p><button type="button" class="clear-filters">Clear search and filters</button></div>';
  resultCount.textContent = 'Showing ' + filtered.length + ' of ' + lessonIds.length + ' learning topics';
  updateProgressDisplay();
  observeRevealTargets(topicGrid);
}

function matchesLessonQuery(item, query) {
  return !query || (item.title + ' ' + item.description + ' ' + item.category + ' ' + (item.keywords || []).join(' ')).toLowerCase().includes(query);
}

function renderLessonSearch() {
  const query = lessonSearch.value.trim().toLowerCase();
  if (!query) {
    lessonSearchResults.hidden = true;
    lessonSearch.setAttribute('aria-expanded', 'false');
    lessonSearchResults.innerHTML = '';
    return [];
  }
  const matches = lessonIds.filter(id => matchesLessonQuery(lessons[id], query));
  lessonSearchResults.innerHTML = matches.length
    ? matches.slice(0, 7).map(id => '<button type="button" class="lesson-search-result" role="option" data-lesson-search-result="' + escapeHtml(id) + '"><strong>' + escapeHtml(lessons[id].title) + '</strong><small>' + escapeHtml(lessons[id].category) + '</small></button>').join('')
    : '<div class="lesson-search-empty" role="status">No lessons found</div>';
  lessonSearchResults.hidden = false;
  lessonSearch.setAttribute('aria-expanded', 'true');
  return matches;
}

function openLessonSearchResult(id, opener = lessonSearch) {
  if (!lessons[id]) return;
  lessonSearchResults.hidden = true;
  lessonSearch.setAttribute('aria-expanded', 'false');
  openLesson(id, opener);
}

lessonSearch.addEventListener('input', renderLessonSearch);
lessonSearch.addEventListener('focus', () => { if (lessonSearch.value.trim()) renderLessonSearch(); });
lessonSearch.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    const firstResult = lessonSearchResults.querySelector('[data-lesson-search-result]');
    if (firstResult) { event.preventDefault(); openLessonSearchResult(firstResult.dataset.lessonSearchResult); }
  } else if (event.key === 'Escape') {
    lessonSearchResults.hidden = true;
    lessonSearch.setAttribute('aria-expanded', 'false');
  }
});
lessonSearchResults.addEventListener('click', event => {
  const result = event.target.closest('[data-lesson-search-result]');
  if (result) openLessonSearchResult(result.dataset.lessonSearchResult, result);
});
document.addEventListener('click', event => {
  if (!lessonSearchWrap.contains(event.target)) {
    lessonSearchResults.hidden = true;
    lessonSearch.setAttribute('aria-expanded', 'false');
  }
});

function observeRevealTargets(root = document) {
  const targets = root.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window) || reduceMotion.matches) {
    targets.forEach(element => element.classList.add('is-visible'));
    return;
  }
  if (!revealObserver) return;
  targets.forEach(element => {
    if (element.classList.contains('is-visible')) return;
    element.style.willChange = 'transform, opacity';
    revealObserver.observe(element);
  });
}

function initScrollExperience() {
  const revealMap = [
    ['.hero-copy .eyebrow', 'up'], ['.hero-copy h1', 'up'], ['.hero-lede', 'up'], ['.hero-actions', 'up'], ['.hero-stats', 'up'],
    ['.learn-heading .eyebrow', 'up'], ['#learn-title', 'up'], ['.section-intro', 'up'], ['.learning-progress', 'scale'], ['.hub-controls', 'up'], ['.topic-results', 'up'],
    ['.practice', 'scale'], ['.practice-copy', 'left'], ['.practice-aside', 'scale'],
    ['#lessons .section-heading .eyebrow', 'up'], ['#recommended-title', 'up'], ['#lessons .text-link', 'right'],
    ['.quick-help', 'scale'], ['.quick-help>div:first-child', 'left'], ['.help-tags', 'right'],
    ['.site-footer .brand', 'up'], ['.site-footer p', 'up'], ['.site-footer>a:last-child', 'up']
  ];
  revealMap.forEach(([selector, direction], groupIndex) => {
    document.querySelectorAll(selector).forEach((element, index) => {
      element.dataset.reveal = direction;
      const heroDelays = ['0ms', '100ms', '190ms', '280ms', '380ms'];
      const delay = groupIndex < heroDelays.length ? heroDelays[groupIndex] : index * (window.innerWidth <= 650 ? 30 : 50);
      element.style.setProperty('--reveal-delay', delay);
    });
  });
  document.querySelectorAll('.recommended-grid .lesson-card').forEach((element, index) => {
    element.dataset.reveal = 'up';
    element.style.setProperty('--reveal-delay', (index * (window.innerWidth <= 650 ? 35 : 75)) + 'ms');
  });

  initRevealObserver();
  observeRevealTargets();

  const hero = document.querySelector('.hero');
  const updateDepth = () => {
    parallaxFrame = null;
    if (reduceMotion.matches) return;
    const rect = hero.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const strength = window.innerWidth <= 650 ? .012 : .024;
    const offset = Math.max(-7, Math.min(7, -rect.top * strength));
    hero.style.setProperty('--hero-depth', offset.toFixed(2) + 'px');
  };
  const requestDepthUpdate = () => {
    if (!reduceMotion.matches && parallaxFrame === null) parallaxFrame = window.requestAnimationFrame(updateDepth);
  };
  window.addEventListener('scroll', requestDepthUpdate, {passive: true});
  window.addEventListener('resize', requestDepthUpdate, {passive: true});
  requestDepthUpdate();
  reduceMotion.addEventListener?.('change', () => {
    if (reduceMotion.matches) {
      if (parallaxFrame !== null) window.cancelAnimationFrame(parallaxFrame);
      parallaxFrame = null;
      hero.style.removeProperty('--hero-depth');
      document.querySelectorAll('[data-reveal]').forEach(element => element.classList.add('is-visible'));
      revealObserver?.disconnect();
      revealObserver = null;
    } else {
      document.querySelectorAll('[data-reveal]').forEach(element => element.classList.remove('is-visible'));
      revealObserver = null;
      initRevealObserver();
      observeRevealTargets();
      requestDepthUpdate();
    }
  });
}

function initRevealObserver() {
  if (!('IntersectionObserver' in window) || reduceMotion.matches) return;
  revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.willChange = 'transform, opacity';
      entry.target.classList.add('is-visible');
      return;
    }
    entry.target.classList.remove('is-visible');
    entry.target.style.willChange = 'auto';
  }), {threshold: .12, rootMargin: '0px 0px -36px 0px'});
}
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(chip => {
    const selected = chip === button;
    chip.classList.toggle('is-active', selected);
    chip.setAttribute('aria-pressed', String(selected));
  });
  renderHub();
}));
topicSearch.addEventListener('input', renderHub);
topicGrid.addEventListener('click', event => {
  if (event.target.closest('.clear-filters')) {
    topicSearch.value = '';
    activeFilter = 'All';
    document.querySelectorAll('[data-filter]').forEach(chip => {
      const selected = chip.dataset.filter === 'All';
      chip.classList.toggle('is-active', selected);
      chip.setAttribute('aria-pressed', String(selected));
    });
    renderHub();
  }
});

function sectionMarkup(section, index) {
  const id = 'lesson-section-' + index;
  return '<section class="lesson-section" id="' + id + '"><p class="lesson-kicker">PART ' + String(index + 1).padStart(2,'0') + '</p><h3>' + escapeHtml(section.heading) + '</h3>' +
    (section.text ? '<p>' + escapeHtml(section.text) + '</p>' : '') +
    (section.points?.length ? '<ul>' + section.points.map(point => '<li>' + escapeHtml(point) + '</li>').join('') + '</ul>' : '') + '</section>';
}
function watchMarkup(watch) {
  const player = watch.embedUrl
    ? '<div class="video-frame"><iframe src="' + escapeHtml(watch.embedUrl) + '" title="' + escapeHtml(watch.title) + '" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>'
    : '<div class="video-placeholder" role="group" aria-label="External video placeholder"><span class="video-play" aria-hidden="true">▶</span><div><strong>External video placeholder</strong><small>' + escapeHtml(watch.creator) + '</small></div></div>';
  const source = watch.url
    ? '<a class="source-action" href="' + escapeHtml(watch.url) + '" target="_blank" rel="noopener noreferrer">Open original video source ↗</a>'
    : '<span class="source-placeholder">Source link will be added after review.</span>';
  const status = watch.embedUrl
    ? 'External video — plays from the original source.'
    : 'External video — a verified source will play from its original site. No video is embedded in this prototype.';
  return '<section class="lesson-section watch-section" id="lesson-watch"><p class="lesson-kicker">WATCH &amp; LEARN</p><h3>' + escapeHtml(watch.title) + '</h3>' +
    player + '<p>' + escapeHtml(watch.description) + '</p><p class="external-note"><strong>' + status + '</strong></p><p class="video-byline">Creator/organization: ' + escapeHtml(watch.creator) + '</p>' + source + '</section>';
}
function notesMarkup(notes) {
  if (!notes || !notes.file) {
    return '<section class="lesson-section notes-section" id="lesson-notes"><p class="lesson-kicker">OPTIONAL DEEPER STUDY</p><h3>📚 More Notes</h3><p>Go deeper with detailed notes, examples, diagrams and revision material.</p><p class="notes-coming-soon">Detailed notes coming soon</p></section>';
  }
  const title = notes.title || 'Detailed lesson notes';
  const description = notes.description || 'Optional study and revision material for this lesson.';
  return '<section class="lesson-section notes-section" id="lesson-notes"><p class="lesson-kicker">OPTIONAL DEEPER STUDY</p><h3>📚 More Notes</h3><p>' + escapeHtml(description) + '</p><a class="notes-open-link" href="' + escapeHtml(notes.file) + '" target="_blank" rel="noopener noreferrer" aria-label="Open ' + escapeHtml(title) + '">Open Detailed Notes ↗</a><a class="notes-download-link" href="' + escapeHtml(notes.file) + '" download>Download PDF</a></section>';
}
function resourceMarkup(resources = []) {
  if (!resources.length) return '';
  return '<section class="lesson-section resource-section" id="lesson-resources"><p class="lesson-kicker">TRUSTED FURTHER LEARNING</p><h3>🌐 Official Resources</h3><p>Trusted external resources selected for this topic.</p><div class="official-resource-list">' +
    resources.map(resource => '<a class="official-resource" href="' + escapeHtml(resource.url) + '" target="_blank" rel="noopener noreferrer"><span><strong>' + escapeHtml(resource.title) + ' ↗</strong><small>' + escapeHtml(resource.organization) + '</small><span class="official-resource-description">' + escapeHtml(resource.description) + '</span></span></a>').join('') + '</div></section>';
}
function lessonTocMarkup(lesson) {
  const links = lesson.sections.map((section,index) => '<a href="#lesson-section-' + index + '">' + escapeHtml(section.heading) + '</a>');
  links.push('<a href="#lesson-watch">Watch &amp; Learn</a>');
  links.push('<a href="#lesson-quick-tips">Quick tips / checklist</a>');
  links.push('<a href="#lesson-practical-lab">Practical Lab</a>');
  links.push('<a href="#lesson-notes">More Notes</a>');
  if (lesson.resources?.length) links.push('<a href="#lesson-resources">Official Resources</a>');
  links.push('<a href="#lesson-quiz">Knowledge check</a>');
  return links.join('');
}
function quickTipsMarkup(lesson) {
  const tips = lesson.quickTips || ["Pause and verify unexpected requests.","Use official device or service settings.","Keep recovery options current.","Ask a trusted professional when unsure."];
  return '<section class="lesson-section quick-tips-section" id="lesson-quick-tips"><p class="lesson-kicker">QUICK TIPS / SAFETY CHECKLIST</p><h3>Small habits that help.</h3><ul>' + tips.map(tip => '<li>' + escapeHtml(tip) + '</li>').join('') + '</ul></section>';
}
function practiceBridgeMarkup(id, lesson) {
  const practiceTopic = lesson.practiceTopic || ({phishing:'phishing',wifi:'publicwifi',mobile:'mobile',payments:'upi',email:'email',socialmedia:'social',passwords:'accounts',mfa:'accounts',social:'social',malware:'computer'}[id] || 'phishing');
  return '<section class="lesson-section lesson-practice-bridge" id="lesson-practical-lab"><p class="lesson-kicker">PRACTICAL LAB</p><h3>Ready to try a real-life situation?</h3><p>Apply this lesson in a short scenario. Practice is separate from your quiz and does not affect your progress score.</p><a class="practice-lesson-link" href="#practice" data-open-practice="' + escapeHtml(practiceTopic) + '" data-return-lesson="' + escapeHtml(id) + '">Open related practice →</a></section>';
}
function renderLessonContent(id) {
  const lesson = lessons[id];
  content.innerHTML = lesson.sections.map(sectionMarkup).join('') + watchMarkup(lesson.watch) + notesMarkup(lesson.notes) + resourceMarkup(lesson.resources) + quickTipsMarkup(lesson) + practiceBridgeMarkup(id, lesson) +
    '<section class="lesson-section quiz-section" id="lesson-quiz"><p class="lesson-kicker">QUICK KNOWLEDGE CHECK</p><h3>Check what you learned.</h3><p>Choose an answer to see why it is safer. You can review every answer at the end.</p><div id="quiz-area"></div></section>';
  document.querySelector('#lesson-toc').innerHTML = lessonTocMarkup(lesson);
  renderQuiz();
}
function renderQuiz() {
  const lesson = lessons[activeLessonId];
  const attempt = attemptFor(activeLessonId);
  const area = document.querySelector('#quiz-area');
  const score = attempt.answers.filter(answer => answer?.correct).length;
  if (activeLessonId) {
    const answeredCount = attempt.answers.filter(Boolean).length;
    const lessonDone = progress.completed.includes(activeLessonId);
    document.querySelector('#sidebar-progress-text').textContent = lessonDone ? 'Completed' : answeredCount ? 'Knowledge check ' + answeredCount + ' of ' + lesson.quiz.length : 'Lesson started · 0%';
    document.querySelector('#sidebar-progress-fill').style.width = (lessonDone ? 100 : Math.round(answeredCount / lesson.quiz.length * 100)) + '%';
  }
  if (progress.completed.includes(activeLessonId)) {
    area.innerHTML = '<div class="quiz-complete"><span class="quiz-state-icon" aria-hidden="true">✓</span><h4>Lesson complete</h4><p>You scored ' + score + ' out of ' + lesson.quiz.length + '. Your completion is saved on this device.</p><button type="button" class="quiz-secondary" data-quiz-action="retake">Retake knowledge check</button></div>';
    return;
  }
  if (attempt.phase === 'result' || attempt.index >= lesson.quiz.length) {
    const reviews = attempt.review ? '<div class="answer-review">' + lesson.quiz.map((q,index) => {
      const answer = attempt.answers[index];
      return '<article><strong>Question ' + (index + 1) + '</strong><p>' + escapeHtml(q.question) + '</p><p class="review-selected">Your answer: ' + escapeHtml(q.options[answer?.choice ?? -1] || 'Not answered') + '</p><p class="review-correct">Safer answer: ' + escapeHtml(q.options[q.answer]) + '</p><p>' + escapeHtml(q.why) + '</p></article>';
    }).join('') + '</div>' : '';
    area.innerHTML = '<div class="quiz-results"><p class="quiz-progress-label">CHECK COMPLETE</p><h4>Your score: ' + score + ' / ' + lesson.quiz.length + '</h4><p>Use the explanations to review anything that felt unclear. You can try the questions again at any time.</p>' +
      '<div class="quiz-result-actions"><button type="button" class="quiz-secondary" data-quiz-action="review">' + (attempt.review ? 'Hide answer review' : 'Review answers') + '</button><button type="button" class="quiz-primary" data-quiz-action="complete">Complete lesson</button></div>' + reviews + '</div>';
    return;
  }
  const index = attempt.index;
  const question = lesson.quiz[index];
  const chosen = attempt.answers[index];
  const feedback = attempt.phase === 'feedback' && chosen
    ? '<div class="answer-feedback ' + (chosen.correct ? 'answer-safe' : 'answer-rethink') + '" role="status"><strong>' + (chosen.correct ? 'That is the safer choice.' : 'That is not the safest choice.') + '</strong><p><strong>Safer answer:</strong> ' + escapeHtml(question.options[question.answer]) + '</p><p>' + escapeHtml(question.why) + '</p></div>'
    : '';
  const options = question.options.map((option,optIndex) => {
    const selected = chosen && chosen.choice === optIndex;
    return '<button type="button" class="quiz-option' + (selected ? (chosen.correct ? ' is-correct' : ' is-incorrect') : '') + '" data-answer-index="' + optIndex + '" ' + (chosen ? 'disabled' : '') + '><span class="option-letter" aria-hidden="true">' + String.fromCharCode(65 + optIndex) + '</span><span>' + escapeHtml(option) + '</span>' + (selected ? '<span class="option-result">' + (chosen.correct ? 'Your choice' : 'Your choice') + '</span>' : '') + '</button>';
  }).join('');
  const action = chosen ? '<button type="button" class="quiz-primary" data-quiz-action="next">' + (index + 1 === lesson.quiz.length ? 'See your results' : 'Next question') + ' →</button>' : '';
  area.innerHTML = '<div class="quiz-question"><div class="quiz-question-top"><span>Question ' + (index + 1) + ' of ' + lesson.quiz.length + '</span><span>Score ' + score + ' / ' + lesson.quiz.length + '</span></div><div class="quiz-progress-track"><span style="width:' + Math.round(index / lesson.quiz.length * 100) + '%"></span></div><h4>' + escapeHtml(question.question) + '</h4><div class="quiz-options">' + options + '</div>' + feedback + '<div class="quiz-action-row">' + action + '</div></div>';
}
content.addEventListener('click', event => {
  const practiceLink = event.target.closest('[data-open-practice]');
  if (practiceLink) {
    event.preventDefault();
    closeLesson();
    requestAnimationFrame(() => {
      selectPracticeTopic(practiceLink.dataset.openPractice, practiceLink.dataset.returnLesson);
      document.querySelector('#practice').scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth'});
    });
    return;
  }
  const answerButton = event.target.closest('[data-answer-index]');
  if (answerButton && activeLessonId) {
    const attempt = attemptFor(activeLessonId);
    if (attempt.phase !== 'question') return;
    const lesson = lessons[activeLessonId];
    const choice = Number(answerButton.dataset.answerIndex);
    attempt.answers[attempt.index] = {choice, correct: choice === lesson.quiz[attempt.index].answer};
    attempt.phase = 'feedback';
    saveAttempt(activeLessonId, attempt);
    renderQuiz();
    return;
  }
  const actionButton = event.target.closest('[data-quiz-action]');
  if (!actionButton || !activeLessonId) return;
  const attempt = attemptFor(activeLessonId);
  if (actionButton.dataset.quizAction === 'next') {
    attempt.index += 1;
    attempt.phase = attempt.index >= lessons[activeLessonId].quiz.length ? 'result' : 'question';
    saveAttempt(activeLessonId, attempt);
    renderQuiz();
  } else if (actionButton.dataset.quizAction === 'review') {
    attempt.review = !attempt.review;
    saveAttempt(activeLessonId, attempt);
    renderQuiz();
  } else if (actionButton.dataset.quizAction === 'complete') {
    if (!progress.completed.includes(activeLessonId)) progress.completed.push(activeLessonId);
    saveProgress();
    renderQuiz();
    renderHub();
    renderRecommended();
  } else if (actionButton.dataset.quizAction === 'retake') {
    progress.completed = progress.completed.filter(id => id !== activeLessonId);
    progress.attempts[activeLessonId] = {index: 0, phase: 'question', answers: [], review: false};
    saveProgress();
    renderQuiz();
    renderHub();
    renderRecommended();
  }
});

function renderRecommended() {
  document.querySelectorAll('.recommended-grid [data-open-lesson]').forEach(button => {
    const id = button.dataset.openLesson;
    const isDone = progress.completed.includes(id);
    const label = button.querySelector('.lesson-meta');
    if (label && isDone) label.innerHTML = '✓ &nbsp;Completed <span>Review lesson →</span>';
    else if (label) label.innerHTML = '◷ &nbsp;' + lessons[id].minutes + ' min <span>Open lesson →</span>';
  });
}
function openLesson(id, opener) {
  if (!lessons[id]) return;
  activeLessonId = id;
  if (!dialog.open) lastOpener = opener || document.activeElement;
  progress.lastLesson = id;
  if (!progress.attempts[id]) progress.attempts[id] = {index:0, phase:'question', answers:[], review:false};
  saveProgress();
  const lesson = lessons[id];
  const index = lessonIds.indexOf(id);
  document.querySelector('#lesson-position').textContent = 'Lesson ' + (index + 1) + ' of ' + lessonIds.length;
  document.querySelector('#lesson-track-fill').style.width = ((index + 1) / lessonIds.length * 100) + '%';
  document.querySelector('#dialog-meta').textContent = lesson.difficulty.toUpperCase() + ' · ' + lesson.minutes + ' MIN · ' + lesson.category.toUpperCase();
  document.querySelector('#dialog-title').textContent = lesson.title;
  document.querySelector('#dialog-intro').textContent = lesson.description;
  const attempt = attemptFor(id);
  const completed = progress.completed.includes(id);
  const sectionProgress = completed ? 100 : Math.round(attempt.index / lesson.quiz.length * 100);
  document.querySelector('#sidebar-progress-text').textContent = completed ? 'Completed' : attempt.index ? 'Knowledge check ' + Math.min(attempt.index + 1, lesson.quiz.length) + ' of ' + lesson.quiz.length : 'Lesson started · ' + sectionProgress + '%';
  document.querySelector('#sidebar-progress-fill').style.width = sectionProgress + '%';
  document.querySelector('#previous-lesson').disabled = index === 0;
  document.querySelector('#next-lesson').disabled = index === lessonIds.length - 1;
  renderLessonContent(id);
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => { const savedAttempt = attemptFor(id); if (savedAttempt.answers.length) document.querySelector('#lesson-quiz').scrollIntoView({block:'start'}); else content.scrollTop = 0; content.focus({preventScroll: true}); });
}
function closeLesson() {
  if (dialog.open) dialog.close();
}
document.addEventListener('click', event => {
  const opener = event.target.closest('[data-open-lesson]');
  if (opener) {
    event.preventDefault();
    openLesson(opener.dataset.openLesson, opener);
  }
});
document.querySelector('#close-lesson').addEventListener('click', closeLesson);
document.querySelector('#back-to-hub').addEventListener('click', () => {
  closeLesson();
  requestAnimationFrame(() => { learnSection.scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth'}); document.querySelector('#learn-title').focus({preventScroll:true}); });
});
document.querySelector('#dialog-home-link').addEventListener('click', event => { event.preventDefault(); closeLesson(); window.location.hash = 'home'; });
dialog.addEventListener('click', event => { if (event.target === dialog) closeLesson(); });
dialog.addEventListener('close', () => { if (lastOpener?.isConnected) lastOpener.focus({preventScroll:true}); });
document.querySelector('#previous-lesson').addEventListener('click', () => {
  const index = lessonIds.indexOf(activeLessonId);
  if (index > 0) openLesson(lessonIds[index - 1], document.querySelector('#previous-lesson'));
});
document.querySelector('#next-lesson').addEventListener('click', () => {
  const index = lessonIds.indexOf(activeLessonId);
  if (index < lessonIds.length - 1) openLesson(lessonIds[index + 1], document.querySelector('#next-lesson'));
});
document.querySelector('#lesson-toc').addEventListener('click', event => {
  const link = event.target.closest('a[href^="#lesson-"]');
  if (!link) return;
  const target = document.querySelector(link.getAttribute('href'));
  if (target) { event.preventDefault(); target.scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth', block:'start'}); }
});


function renderPracticeTopics() {
  const data = window.SAFETY_PRACTICE_SCENARIOS || {};
  document.querySelector('#practice-topics').innerHTML = Object.entries(practiceTopicLabels).map(([id,[icon,title]]) => {
    const count = data[id]?.length || 0;
    return '<button type="button" class="practice-topic-button" data-practice-topic="' + id + '"' + (count ? '' : ' disabled') + '><span class="practice-topic-icon" aria-hidden="true">' + icon + '</span><span><strong>' + escapeHtml(title) + '</strong><small>' + count + (count === 1 ? ' scenario' : ' scenarios') + '</small></span><span class="practice-topic-arrow" aria-hidden="true">→</span></button>';
  }).join('');
}
function showPracticeTopics() {
  activePracticeTopic = null;
  pendingPracticeLesson = null;
  selectedScenarioChoice = null;
  practiceTopicFinished = false;
  document.querySelector('#practice-topics').hidden = false;
  document.querySelector('#practice-player').hidden = true;
}
function renderPracticeScenario() {
  const scenarios = (window.SAFETY_PRACTICE_SCENARIOS || {})[activePracticeTopic] || [];
  const labels = practiceTopicLabels[activePracticeTopic] || ['🧪','Practice'];
  document.querySelector('#practice-topic-title').textContent = labels[1];
  document.querySelector('#practice-return-lesson').hidden = !(pendingPracticeLesson && selectedScenarioChoice !== null);
  document.querySelector('#practice-step').textContent = practiceTopicFinished ? 'Practice complete · ' + scenarios.length + ' scenarios' : 'Scenario ' + (activeScenarioIndex + 1) + ' of ' + scenarios.length + ' · No score';
  const scene = document.querySelector('#practice-scene');
  if (practiceTopicFinished) {
    scene.innerHTML = '<div class="practice-finished"><span class="practice-finished-icon" aria-hidden="true">✓</span><h4>That’s the practice set.</h4><p>You worked through ' + scenarios.length + ' realistic situations. Review a lesson or repeat these scenarios whenever you like.</p></div>';
    document.querySelector('#practice-next').hidden = true;
    return;
  }
  document.querySelector('#practice-next').hidden = false;
  const scenario = scenarios[activeScenarioIndex];
  const choice = selectedScenarioChoice === null ? null : scenario.choices[selectedScenarioChoice];
  const safeChoice = scenario.choices.find(item => item.safe);
  const options = scenario.choices.map((item,index) => '<button type="button" class="practice-option' + (choice && selectedScenarioChoice === index ? (item.safe ? ' is-safe' : ' is-unsafe') : '') + '" data-practice-choice="' + index + '"' + (choice ? ' disabled' : '') + '><span class="practice-option-letter" aria-hidden="true">' + String.fromCharCode(65+index) + '</span><span>' + escapeHtml(item.label) + '</span><span class="practice-option-arrow" aria-hidden="true">→</span></button>').join('');
  const feedback = choice ? '<div class="scenario-result' + (choice.safe ? '' : ' is-wrong') + '" role="status"><strong>' + (choice.safe ? 'Good decision.' : 'Consider a safer step.') + '</strong><p>' + escapeHtml(choice.explanation) + '</p>' + (choice.safe ? '' : '<p><b>Safer option:</b> ' + escapeHtml(safeChoice.label) + ' ' + escapeHtml(safeChoice.explanation) + '</p>') + '<p><b>Recommended action:</b> ' + escapeHtml(scenario.recommendation) + '</p></div>' : '';
  scene.innerHTML = '<article class="practice-scenario"><p class="practice-scenario-label">' + escapeHtml(scenario.title) + '</p><p class="practice-situation">' + escapeHtml(scenario.situation) + '</p><h4>' + escapeHtml(scenario.question) + '</h4><div class="practice-options">' + options + '</div>' + feedback + '</article>';
  document.querySelector('#practice-next').disabled = !choice;
  document.querySelector('#practice-next').textContent = activeScenarioIndex === scenarios.length - 1 ? 'Finish topic →' : 'Next scenario →';
}
function selectPracticeTopic(id, returnLesson = null) {
  if (!(window.SAFETY_PRACTICE_SCENARIOS || {})[id]?.length) return;
  activePracticeTopic = id;
  pendingPracticeLesson = lessons[returnLesson] ? returnLesson : null;
  activeScenarioIndex = 0;
  selectedScenarioChoice = null;
  practiceTopicFinished = false;
  document.querySelector('#practice-topics').hidden = true;
  document.querySelector('#practice-player').hidden = false;
  renderPracticeScenario();
}
function initPractice() {
  renderPracticeTopics();
  document.querySelector('#practice-topics').addEventListener('click', event => {
    const button = event.target.closest('[data-practice-topic]');
    if (button) selectPracticeTopic(button.dataset.practiceTopic);
  });
  const player = document.querySelector('#practice-player');
  player.addEventListener('click', event => {
    const back = event.target.closest('#practice-back');
    const restart = event.target.closest('#practice-restart');
    const next = event.target.closest('#practice-next');
    const returnLesson = event.target.closest('#practice-return-lesson');
    const choice = event.target.closest('[data-practice-choice]');
    if (back) { showPracticeTopics(); return; }
    if (returnLesson && pendingPracticeLesson) {
      const id = pendingPracticeLesson;
      pendingPracticeLesson = null;
      openLesson(id, returnLesson);
      requestAnimationFrame(() => document.querySelector('#lesson-quiz').scrollIntoView({behavior: reduceMotion.matches ? 'auto' : 'smooth', block:'start'}));
      return;
    }
    if (restart) { activeScenarioIndex=0;selectedScenarioChoice=null;practiceTopicFinished=false;renderPracticeScenario();return; }
    if (next && !next.disabled) {
      const scenarios=(window.SAFETY_PRACTICE_SCENARIOS||{})[activePracticeTopic]||[];
      if (activeScenarioIndex >= scenarios.length-1) practiceTopicFinished=true;
      else { activeScenarioIndex+=1;selectedScenarioChoice=null; }
      renderPracticeScenario();return;
    }
    if (choice && selectedScenarioChoice === null) {
      selectedScenarioChoice=Number(choice.dataset.practiceChoice);
      renderPracticeScenario();
    }
  });
}
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  nav.classList.toggle('is-open', !open);
});
themeToggle.addEventListener('click', () => applyTheme(activeTheme === 'dark' ? 'light' : 'dark', true));
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  link.classList.add('is-clicked');
  window.setTimeout(() => link.classList.remove('is-clicked'), 650);
}));
initPractice();
renderHub();
renderRecommended();
initScrollExperience();






const hero=document.querySelector('.hero');
const typeHeading=document.querySelector('.typewriter-heading');
const typedPrefix=typeHeading.querySelector('.typed-prefix');
const typedAccent=typeHeading.querySelector('.typed-accent');
const plainTitle='A safer digital life starts with ';
const accentTitle='one small step.';
let typingTimer=null;
function clearHeadlineTyping(){if(typingTimer!==null){window.clearTimeout(typingTimer);typingTimer=null}typedPrefix.textContent='';typedAccent.textContent=''}
function typeHeadline(){clearHeadlineTyping();if(reduceMotion.matches){typedPrefix.textContent=plainTitle;typedAccent.textContent=accentTitle;return}let position=0;const step=()=>{if(position<plainTitle.length){typedPrefix.textContent=plainTitle.slice(0,++position);typingTimer=window.setTimeout(step,34);return}const accentPosition=position-plainTitle.length;if(accentPosition<accentTitle.length){typedAccent.textContent=accentTitle.slice(0,accentPosition+1);position++;typingTimer=window.setTimeout(step,48);return}typingTimer=null};step()}
if('IntersectionObserver' in window){const headlineObserver=new IntersectionObserver(entries=>entries.forEach(entry=>entry.isIntersecting?typeHeadline():clearHeadlineTyping()),{threshold:.18});headlineObserver.observe(hero)}else{typeHeadline()}
reduceMotion.addEventListener?.('change',()=>{if(reduceMotion.matches){clearHeadlineTyping();typedPrefix.textContent=plainTitle;typedAccent.textContent=accentTitle}});

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
