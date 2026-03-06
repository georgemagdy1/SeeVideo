// ══════════════════════════════════════════
//   TATAWAR ACADEMY — main.js (updated)
//   Firebase JS SDK v11 (latest modular)
// ══════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, query, where, getDocs, addDoc, orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

/* ── CONFIG ──────────────────────────────── */
const firebaseConfig = {
  apiKey: "AIzaSyA1Z5LkTwaVL_QM5IWiDs4uNKnT34r1T60",
  authDomain: "edustream-42dff.firebaseapp.com",
  projectId: "edustream-42dff",
  storageBucket: "edustream-42dff.firebasestorage.app",
  messagingSenderId: "185392712686",
  appId: "1:185392712686:web:3611e66f93007413e79cff"
};
const ADMIN_SECRET   = "EduAdmin2024!";
const TRAINER_SECRET = "EduTrainer2024!";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ── HELPERS ─────────────────────────────── */
const $ = id => document.getElementById(id);

let toastTimer;
const showErr = msg => showToast('aerr', msg, 4500);
const showOk  = msg => showToast('aok',  msg, 3500);
function showToast(id, msg, dur) {
  clearTimeout(toastTimer);
  const el = $(id);
  el.textContent = msg;
  el.style.display = 'block';
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, dur);
}

function courseLabel(code) {
  return code === 'all' ? 'كل المواد' : COURSES[code] || code;
}
function groupLabel(id) {
  return id === 'all' ? 'كل المجموعات' : GROUPS[id]?.name || id;
}
function groupEmoji(name = '') {
  const list = ['📘','📗','📙','📕','📓','🟦','🟩','🟧'];
  let h = 0;
  for (let c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return list[h % list.length];
}
function extractYTId(input) {
  input = input.trim();
  const m = input.match(/(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/) || input.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}
function extractDriveId(input) {
  input = input.trim();
  const m1 = input.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m1) return m1[1];
  const m2 = input.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input;
  return null;
}
function buildVideoUrl(type, rawId) {
  if (type === 'gdrive')  return `https://drive.google.com/file/d/${rawId}/view`;
  if (type === 'youtube') return `https://www.youtube.com/watch?v=${rawId}`;
  return '';
}

/* ── STATE ───────────────────────────────── */
let COURSES = {
  math:'الرياضيات', physics:'الفيزياء', cs:'علم الحاسوب',
  chemistry:'الكيمياء', biology:'الأحياء', english:'اللغة الإنجليزية'
};
let GROUPS = {};
let ALL_STUDENTS = [];
let currentSource = 'youtube';
let currentUser = null;
let currentUserData = null;
let currentGroupId = null;
let currentGroupData = null;
let allVideosCache = [];
let currentModalVideoId = null;
let currentQuizId = null;
let quizQuestions = [];
let quizTimer = null;
let quizSecondsLeft = 0;

/* ── LOADERS ─────────────────────────────── */
async function loadGroups() {
  GROUPS = {};
  const snap = await getDocs(collection(db, 'groups'));
  snap.forEach(d => { GROUPS[d.id] = { ...d.data(), id: d.id }; });
}
async function loadStudents() {
  ALL_STUDENTS = [];
  const snap = await getDocs(query(collection(db, 'users'), where('role','==','student')));
  snap.forEach(d => ALL_STUDENTS.push({ uid: d.id, ...d.data() }));
}

/* ══════════════════════════════════════════
   AUTH SCREEN — Unified single login
══════════════════════════════════════════ */
window.showLoginSection = () => {
  $('login-section').style.display    = 'block';
  $('register-section').style.display = 'none';
};
window.showRegSection = () => {
  $('login-section').style.display    = 'none';
  $('register-section').style.display = 'block';
};

/* Login — works for all roles */
window.doLogin = async () => {
  const email = $('le').value.trim().toLowerCase();
  const pass  = $('lp').value;
  if (!email || !pass) return showErr('أدخل البريد وكلمة المرور.');
  try { await signInWithEmailAndPassword(auth, email, pass); }
  catch(e) {
    const msgs = {
      'auth/user-not-found':'لم يُعثر على الحساب.',
      'auth/wrong-password':'كلمة المرور خاطئة.',
      'auth/invalid-credential':'بيانات الدخول غير صحيحة.',
      'auth/too-many-requests':'كثرة المحاولات، حاول لاحقاً.'
    };
    showErr(msgs[e.code] || e.message);
  }
};

/* Register — role determined by secret key */
window.doRegister = async () => {
  const name  = $('rn').value.trim();
  const email = $('re').value.trim().toLowerCase();
  const pass  = $('rp').value;
  const key   = $('rsk').value.trim();
  if (!name || !email || !pass) return showErr('يرجى ملء الاسم والبريد وكلمة المرور.');
  if (pass.length < 6) return showErr('كلمة المرور 6 أحرف على الأقل.');

  let role = 'student';
  if (key === ADMIN_SECRET)        role = 'admin';
  else if (key === TRAINER_SECRET) role = 'trainer';
  else if (key !== '')             return showErr('❌ المفتاح السري غير صحيح.');

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db,'users',cred.user.uid), {
      name, email, groups:[], role, createdAt: new Date().toISOString()
    });
    showOk(`تم إنشاء حساب ${role === 'admin' ? 'المسؤول' : role === 'trainer' ? 'المدرب' : 'الطالب'}!`);
  } catch(e) {
    showErr(e.code === 'auth/email-already-in-use' ? 'البريد مستخدم مسبقاً.' : e.message);
  }
};

window.doLogout = () => signOut(auth);

/* ══════════════════════════════════════════
   AUTH STATE
══════════════════════════════════════════ */
onAuthStateChanged(auth, async user => {
  $('global-loader').classList.add('hide');
  if (!user) {
    $('auth-screen').style.display = 'flex';
    $('app-screen').style.display  = 'none';
    return;
  }
  $('auth-screen').style.display = 'none';
  $('app-screen').style.display  = 'block';

  await loadGroups();
  const snap = await getDoc(doc(db,'users',user.uid));
  if (!snap.exists()) { await signOut(auth); return; }
  const userData = snap.data();
  currentUser     = user;
  currentUserData = userData;

  $('nName').textContent     = userData.name;
  $('navAvatar').textContent = userData.name.charAt(0).toUpperCase();

  $('adminChip').style.display   = 'none';
  $('trainerChip').style.display = 'none';

  if (userData.role === 'admin') {
    $('adminChip').style.display       = 'flex';
    $('admin-panel').style.display     = 'block';
    $('group-picker').style.display    = 'none';
    $('student-content').style.display = 'none';
    $('groupChip').style.display       = 'none';
    await initAdminPanel(false);

  } else if (userData.role === 'trainer') {
    $('trainerChip').style.display     = 'flex';
    $('admin-panel').style.display     = 'block';
    $('group-picker').style.display    = 'none';
    $('student-content').style.display = 'none';
    $('groupChip').style.display       = 'none';
    await initAdminPanel(true);

  } else {
    $('admin-panel').style.display     = 'none';
    $('student-content').style.display = 'none';
    $('group-picker').style.display    = 'flex';
    $('groupChip').style.display       = 'none';
    showGroupPicker(userData);
  }
});

/* ══════════════════════════════════════════
   GROUP PICKER (student)
══════════════════════════════════════════ */
function showGroupPicker(userData) {
  $('admin-panel').style.display     = 'none';
  $('student-content').style.display = 'none';
  $('group-picker').style.display    = 'flex';
  $('groupChip').style.display       = 'none';
  $('gp-hello').textContent = 'اهلا، ' + userData.name + '!';

  const groups = userData.groups || [];
  const grid   = $('gp-grid');

  if (!groups.length) {
    grid.innerHTML = '<div class="empty-state"><div class="ei">📭</div><p>لم يتم تعيينك في أي مجموعة بعد. تواصل مع المسؤول.</p></div>';
    return;
  }

  grid.innerHTML = '';
  groups.forEach((gid, i) => {
    const g = GROUPS[gid]; if (!g) return;
    const card = document.createElement('div');
    card.className = 'gp-card';
    card.style.animationDelay = (i * 0.08) + 's';
    card.innerHTML =
      '<div class="gp-ic">' + groupEmoji(g.name) + '</div>' +
      '<div class="gp-name">' + g.name + '</div>' +
      '<div class="gp-course">' + courseLabel(g.courseId) + '</div>' +
      '<div class="gp-arrow">←</div>';
    card.onclick = () => enterGroup(gid, g);
    grid.appendChild(card);
  });

  loadStudentOverallStats(userData);
}

async function loadStudentOverallStats(userData) {
  try {
    const progressSnap = await getDoc(doc(db,'progress', currentUser.uid));
    const watched = progressSnap.exists()
      ? Object.keys(progressSnap.data().watched || {}).length : 0;
    $('gps-watched').textContent = watched;
    $('gp-stats').style.display  = 'flex';
  } catch(_) {}
}

async function enterGroup(gid, gdata) {
  currentGroupId   = gid;
  currentGroupData = gdata;
  allVideosCache   = [];
  $('group-picker').style.display    = 'none';
  $('student-content').style.display = 'block';
  $('groupChip').style.display       = 'flex';
  $('nGroup').textContent = gdata.name;
  $('sct').textContent    = courseLabel(gdata.courseId);
  $('sgt').textContent    = gdata.name;
  switchStudentTab('videos');
}

window.backToGroupPicker = () => {
  $('student-content').style.display = 'none';
  $('groupChip').style.display = 'none';
  currentGroupId = null; currentGroupData = null; allVideosCache = [];
  showGroupPicker(currentUserData);
};

/* ══════════════════════════════════════════
   STUDENT TABS
══════════════════════════════════════════ */
window.switchStudentTab = tab => {
  ['videos','quizzes','progress'].forEach(t => {
    $('student-'+t+'-tab').style.display = t === tab ? 'block' : 'none';
    $('snav-'+t).classList.toggle('on', t === tab);
  });
  if (tab === 'videos')   loadStudentVideos();
  if (tab === 'quizzes')  loadStudentQuizzes();
  if (tab === 'progress') loadProgressDashboard();
};

async function loadStudentVideos() {
  const grid = $('vgrid');
  grid.innerHTML = '<div class="loading-state"><div class="spin"></div><p>جارٍ تحميل الفيديوهات…</p></div>';
  try {
    const { courseId } = currentGroupData;
    const gid = currentGroupId;
    const [s1,s2,s3] = await Promise.all([
      getDocs(query(collection(db,'videos'), where('course','==',courseId), where('group','==',gid))),
      getDocs(query(collection(db,'videos'), where('course','==',courseId), where('group','==','all'))),
      getDocs(query(collection(db,'videos'), where('course','==','all'),    where('group','==','all')))
    ]);
    const seen = new Set();
    allVideosCache = [];
    [s1,s2,s3].forEach(snap => snap.forEach(d => {
      if (!seen.has(d.id)) { seen.add(d.id); allVideosCache.push({ id: d.id, ...d.data() }); }
    }));
    const progressSnap = await getDoc(doc(db,'progress', currentUser.uid));
    const watched = progressSnap.exists() ? (progressSnap.data().watched || {}) : {};
    renderVideoGrid(allVideosCache, watched);
    updateProgressPill(allVideosCache.length, Object.keys(watched).length);
  } catch(e) {
    grid.innerHTML = '<div class="empty-state"><p>خطأ: ' + e.message + '</p></div>';
  }
}

function renderVideoGrid(videos, watched = {}) {
  const grid = $('vgrid');
  if (!videos.length) {
    grid.innerHTML = '<div class="empty-state"><div class="ei">📭</div><p>لا توجد فيديوهات في هذه المجموعة بعد.</p></div>';
    return;
  }
  grid.innerHTML = '';
  videos.forEach((v, i) => {
    const isDrive   = v.type === 'gdrive';
    const isWatched = !!watched[v.id];
    const card = document.createElement('div');
    card.className = 'vcard';
    card.style.animationDelay = (i * 0.06) + 's';
    card.dataset.title = v.title.toLowerCase();
    card.dataset.desc  = (v.description || '').toLowerCase();
    card.dataset.vid   = v.id;
    card.innerHTML =
      (isWatched ? '<div class="vcard-watched-badge">تمت المشاهدة</div>' : '') +
      '<div class="thumb">' +
        (isDrive
          ? '<div class="thumb-gd"><div class="thumb-gd-icon">📁</div><div class="thumb-gd-label">Google Drive</div></div><div class="pb pb-gd">▶</div>'
          : '<img src="https://img.youtube.com/vi/' + v.ytId + '/mqdefault.jpg" alt="" loading="lazy"/><div class="pb">▶</div>'
        ) +
      '</div>' +
      '<div class="vcb"><div class="vc-t">' + v.title + '</div><div class="vc-d">' + (v.description||'') + '</div></div>';
    card.onclick = () => {
      currentModalVideoId = v.id;
      if (isDrive) openModalDrive(v.driveId, v.title, v.description, isWatched);
      else         openModalYT(v.ytId, v.title, v.description, isWatched);
    };
    grid.appendChild(card);
  });
}

function updateProgressPill(total, watched) {
  if (!total) return;
  const pct = Math.round((watched / total) * 100);
  $('progress-pill').style.display = 'flex';
  $('pp-fill').style.width  = pct + '%';
  $('pp-text').textContent  = pct + '%';
}

window.filterVideos = () => {
  const q = $('video-search').value.trim().toLowerCase();
  document.querySelectorAll('.vcard').forEach(card => {
    card.style.display = (!q || card.dataset.title.includes(q) || card.dataset.desc.includes(q)) ? '' : 'none';
  });
};

/* ── Video modal ── */
window.openModalYT = (ytId, title, desc, watched = false) => {
  $('vm-title').textContent = title;
  $('mif').src = 'https://www.youtube.com/embed/' + ytId + '?autoplay=1&rel=0';
  $('vm-desc').textContent = desc || '';
  $('mopen').style.display = 'none';
  updateWatchedButton(watched);
  $('vmodal').style.display = 'flex';
  $('comments-section').style.display = 'none';
  loadComments();
};
window.openModalDrive = (fileId, title, desc, watched = false) => {
  $('vm-title').textContent = title;
  $('mif').src  = 'https://drive.google.com/file/d/' + fileId + '/preview';
  $('vm-desc').textContent = desc || '';
  $('mopen').href = 'https://drive.google.com/file/d/' + fileId + '/view';
  $('mopen').style.display = 'flex';
  updateWatchedButton(watched);
  $('vmodal').style.display = 'flex';
  $('comments-section').style.display = 'none';
  loadComments();
};
function updateWatchedButton(watched) {
  const btn = $('btn-watched');
  btn.textContent = watched ? 'تمت المشاهدة' : 'وضع علامة مشاهد';
  btn.classList.toggle('done', watched);
}
window.closeModal    = () => { $('vmodal').style.display = 'none'; $('mif').src = ''; currentModalVideoId = null; };
window.closeModalOut = e  => { if (e.target.id === 'vmodal') closeModal(); };

window.markWatched = async () => {
  if (!currentModalVideoId || !currentUser) return;
  const btn = $('btn-watched');
  if (btn.classList.contains('done')) return;
  try {
    await setDoc(doc(db,'progress', currentUser.uid), {
      watched: { [currentModalVideoId]: new Date().toISOString() },
      userId: currentUser.uid
    }, { merge: true });
    updateWatchedButton(true);
    const card = document.querySelector('.vcard[data-vid="' + currentModalVideoId + '"]');
    if (card && !card.querySelector('.vcard-watched-badge')) {
      const badge = document.createElement('div');
      badge.className = 'vcard-watched-badge';
      badge.textContent = 'تمت المشاهدة';
      card.prepend(badge);
    }
    const pSnap = await getDoc(doc(db,'progress', currentUser.uid));
    const wMap  = pSnap.exists() ? (pSnap.data().watched || {}) : {};
    updateProgressPill(allVideosCache.length, Object.keys(wMap).length);
    showOk('تم تسجيل المشاهدة!');
  } catch(e) { showErr(e.message); }
};

/* ── Comments ── */
window.toggleComments = () => {
  const s = $('comments-section');
  s.style.display = s.style.display === 'none' ? 'block' : 'none';
};
async function loadComments() {
  if (!currentModalVideoId) return;
  const list = $('comments-list');
  list.innerHTML = '<div style="color:var(--text3);font-size:.8rem;padding:.5rem">جارٍ التحميل…</div>';
  try {
    const snap = await getDocs(query(
      collection(db,'comments'),
      where('videoId','==',currentModalVideoId),
      orderBy('createdAt','asc')
    ));
    list.innerHTML = '';
    if (snap.empty) {
      list.innerHTML = '<div style="color:var(--text3);font-size:.8rem;padding:.5rem">لا توجد تعليقات بعد.</div>';
      return;
    }
    snap.forEach(d => {
      const c  = d.data();
      const el = document.createElement('div');
      el.className = 'comment-item';
      el.innerHTML = '<div class="comment-author">' + c.authorName + '</div><div>' + c.text + '</div>';
      list.appendChild(el);
    });
  } catch(_) {}
}
window.addComment = async () => {
  const inp  = $('comment-input');
  const text = inp.value.trim();
  if (!text || !currentModalVideoId) return;
  try {
    await addDoc(collection(db,'comments'), {
      videoId: currentModalVideoId, text,
      authorId: currentUser.uid,
      authorName: currentUserData.name,
      createdAt: serverTimestamp()
    });
    inp.value = '';
    loadComments();
  } catch(e) { showErr(e.message); }
};

/* ── Student quizzes ── */
async function loadStudentQuizzes() {
  const list = $('quiz-list-student');
  list.innerHTML = '<div class="loading-state"><div class="spin"></div><p>جارٍ التحميل…</p></div>';
  try {
    const gid  = currentGroupId;
    const snap = await getDocs(query(collection(db,'quizzes'), where('group','in',[gid,'all'])));
    const resultSnap = await getDoc(doc(db,'quizResults', currentUser.uid));
    const myResults  = resultSnap.exists() ? (resultSnap.data().results || {}) : {};
    list.innerHTML = '';
    if (snap.empty) {
      list.innerHTML = '<div class="empty-state"><div class="ei">📝</div><p>لا توجد اختبارات بعد.</p></div>';
      return;
    }
    snap.forEach(d => {
      const q     = d.data();
      const done  = !!myResults[d.id];
      const score = myResults[d.id]?.score ?? null;
      const card  = document.createElement('div');
      card.className = 'quiz-card';
      card.innerHTML =
        '<div class="qc-info">' +
          '<div class="qc-title">' + q.title + '</div>' +
          '<div class="qc-meta">' +
            '<span>⏱ ' + q.duration + ' دقيقة</span>' +
            '<span>' + (q.questions||[]).length + ' سؤال</span>' +
            '<span class="qc-tag ' + (done ? 'qc-done' : 'qc-pending') + '">' + (done ? 'مكتمل' : 'لم يُحل') + '</span>' +
          '</div>' +
        '</div>' +
        (done
          ? '<div class="qc-score">' + score + '%</div>'
          : '<button class="btn-primary btn-sm" onclick="startQuiz(\'' + d.id + '\')">ابدأ الاختبار</button>'
        );
      list.appendChild(card);
    });
  } catch(e) {
    list.innerHTML = '<div class="empty-state"><p>خطأ: ' + e.message + '</p></div>';
  }
}

/* ── Take quiz ── */
window.startQuiz = async quizId => {
  try {
    const snap = await getDoc(doc(db,'quizzes', quizId));
    if (!snap.exists()) return;
    const quiz = snap.data();
    currentQuizId = quizId;
    quizQuestions = quiz.questions || [];

    $('qtm-title').textContent = quiz.title;
    const body = $('qtm-body');
    body.innerHTML = '';
    quizQuestions.forEach((q, qi) => {
      const block = document.createElement('div');
      block.className = 'quiz-q-block';
      block.innerHTML =
        '<div class="quiz-q-text">السؤال ' + (qi+1) + ': ' + q.text + '</div>' +
        '<div class="quiz-options">' +
          q.options.map((o,oi) =>
            '<label class="quiz-opt" onclick="selectOpt(this,' + qi + ',' + oi + ')">' +
              '<input type="radio" name="q' + qi + '" value="' + oi + '"/>' + o +
            '</label>'
          ).join('') +
        '</div>';
      body.appendChild(block);
    });

    quizSecondsLeft = (quiz.duration || 30) * 60;
    updateTimerDisplay();
    clearInterval(quizTimer);
    quizTimer = setInterval(() => {
      quizSecondsLeft--;
      updateTimerDisplay();
      if (quizSecondsLeft <= 0) submitQuiz();
    }, 1000);

    $('quiz-modal').style.display = 'flex';
  } catch(e) { showErr(e.message); }
};
window.selectOpt = (label, qi, oi) => {
  label.closest('.quiz-options').querySelectorAll('.quiz-opt').forEach(l => l.classList.remove('selected'));
  label.classList.add('selected');
};
function updateTimerDisplay() {
  const m  = Math.floor(quizSecondsLeft / 60).toString().padStart(2,'0');
  const s  = (quizSecondsLeft % 60).toString().padStart(2,'0');
  const el = $('qtm-timer');
  el.textContent = '⏱ ' + m + ':' + s;
  el.classList.toggle('urgent', quizSecondsLeft <= 60);
}
window.closeQuizModal    = () => { clearInterval(quizTimer); $('quiz-modal').style.display = 'none'; };
window.closeQuizModalOut = e  => { if (e.target.id === 'quiz-modal') closeQuizModal(); };

window.submitQuiz = async () => {
  clearInterval(quizTimer);
  let correct = 0;
  quizQuestions.forEach((q, qi) => {
    const sel = $('qtm-body').querySelector('input[name=q' + qi + ']:checked');
    if (sel && parseInt(sel.value) === q.correct) correct++;
  });
  const score = Math.round((correct / quizQuestions.length) * 100);
  try {
    const ref  = doc(db,'quizResults', currentUser.uid);
    const snap = await getDoc(ref);
    const existing = snap.exists() ? (snap.data().results || {}) : {};
    existing[currentQuizId] = { score, correct, total: quizQuestions.length, date: new Date().toISOString() };
    await setDoc(ref, { results: existing, userId: currentUser.uid }, { merge: true });
  } catch(_) {}
  $('quiz-modal').style.display = 'none';
  showQuizResult(score, correct, quizQuestions.length);
};
function showQuizResult(score, correct, total) {
  $('rm-score').textContent = score + '%';
  $('rm-title').textContent = score >= 70 ? 'احسنت!' : score >= 50 ? 'جيد!' : 'حاول مجددا';
  $('rm-msg').textContent   = 'اجبت على ' + correct + ' من ' + total + ' سؤال بشكل صحيح.';
  $('rm-circle').style.background =
    'conic-gradient(' + (score>=70?'var(--green)':score>=50?'var(--orange)':'var(--red)') +
    ' ' + score + '%, var(--border) ' + score + '%)';
  $('quiz-result-modal').style.display = 'flex';
}
window.closeResultModal = () => {
  $('quiz-result-modal').style.display = 'none';
  loadStudentQuizzes();
};

/* ── Progress dashboard ── */
async function loadProgressDashboard() {
  const dash = $('progress-dashboard');
  dash.innerHTML = '<div class="loading-state"><div class="spin"></div><p>جارٍ التحميل…</p></div>';
  try {
    const progressSnap = await getDoc(doc(db,'progress', currentUser.uid));
    const watched      = progressSnap.exists() ? (progressSnap.data().watched || {}) : {};
    const resultSnap   = await getDoc(doc(db,'quizResults', currentUser.uid));
    const results      = resultSnap.exists() ? (resultSnap.data().results || {}) : {};

    const totalVideos  = allVideosCache.length;
    const watchedCount = Object.keys(watched).length;

    const quizSnap     = await getDocs(query(collection(db,'quizzes'), where('group','in',[currentGroupId,'all'])));
    const totalQuizzes = quizSnap.size;
    const doneQuizzes  = quizSnap.docs.filter(d => !!results[d.id]).length;
    const avgScore     = doneQuizzes
      ? Math.round(quizSnap.docs.filter(d=>results[d.id]).reduce((a,d)=>a+results[d.id].score,0)/doneQuizzes)
      : 0;

    const watchPct = totalVideos  ? Math.round((watchedCount/totalVideos)*100)  : 0;
    const quizPct  = totalQuizzes ? Math.round((doneQuizzes/totalQuizzes)*100)  : 0;

    dash.innerHTML =
      '<div class="prog-card">' +
        '<div class="prog-card-title">ملخص التقدم</div>' +
        '<div class="prog-items">' +
          '<div class="prog-item">' +
            '<div class="prog-item-label">مشاهدة الفيديوهات</div>' +
            '<div class="prog-bar-wrap"><div class="prog-bar-fill" style="width:' + watchPct + '%"></div></div>' +
            '<div class="prog-pct">' + watchPct + '%</div>' +
          '</div>' +
          '<div class="prog-item">' +
            '<div class="prog-item-label">اتمام الاختبارات</div>' +
            '<div class="prog-bar-wrap"><div class="prog-bar-fill" style="width:' + quizPct + '%"></div></div>' +
            '<div class="prog-pct">' + quizPct + '%</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">' +
        '<div class="stat-card sc-blue">  <div class="sc-icon">🎬</div><div class="sc-num">' + watchedCount + '/' + totalVideos + '</div><div class="sc-label">فيديو مشاهد</div></div>' +
        '<div class="stat-card sc-purple"><div class="sc-icon">📝</div><div class="sc-num">' + doneQuizzes + '/' + totalQuizzes + '</div><div class="sc-label">اختبار مكتمل</div></div>' +
        '<div class="stat-card sc-green"> <div class="sc-icon">🏆</div><div class="sc-num">' + avgScore + '%</div><div class="sc-label">متوسط الدرجات</div></div>' +
      '</div>';
  } catch(e) {
    dash.innerHTML = '<div class="empty-state"><p>خطأ: ' + e.message + '</p></div>';
  }
}

/* ══════════════════════════════════════════
   ADMIN / TRAINER PANEL
══════════════════════════════════════════ */
async function initAdminPanel(isTrainer = false) {
  populateCourseSelect('vc');
  populateCourseSelect('fc');
  populateCourseSelect('gcourse');
  populateCourseSelect('qc');
  populateCourseSelect('ev-course');
  populateGroupSelect('vg',  '', true);
  populateGroupSelect('fg2', '', true);
  populateGroupSelect('qg',  '', true);
  populateGroupSelect('gv-group-select', '', false);
  populateGroupSelect('ev-group', '', false);

  await loadStudents();
  buildGroupCheckboxes('add-student-groups');
  renderStudentGroupFilter();
  window.loadAdminVideos();
  loadAdminQuizzes();

  if (isTrainer) {
    ['smenu-overview','smenu-quizzes','smenu-groups','smenu-students'].forEach(id => {
      const el = $(id); if (el) el.style.display = 'none';
    });
    showAdminTab('groupvideos');
  } else {
    loadOverviewStats();
    showAdminTab('overview');
  }
}

function populateCourseSelect(id, includeAll = true) {
  const el = $(id); if (!el) return;
  el.innerHTML = includeAll ? '<option value="all">كل المواد</option>' : '';
  Object.entries(COURSES).forEach(([code, name]) => {
    const o = document.createElement('option');
    o.value = code; o.textContent = name;
    el.appendChild(o);
  });
}
function populateGroupSelect(id, courseFilter = '', includeAll = true) {
  const el = $(id); if (!el) return;
  el.innerHTML = includeAll
    ? '<option value="all">كل المجموعات</option>'
    : '<option value="">اختر مجموعة…</option>';
  Object.values(GROUPS)
    .filter(g => !courseFilter || courseFilter === 'all' || g.courseId === courseFilter || g.courseId === 'all')
    .forEach(g => {
      const o = document.createElement('option');
      o.value = g.id;
      const cDisp = (!courseFilter || courseFilter === 'all') ? ' (' + courseLabel(g.courseId) + ')' : '';
      o.textContent = g.name + cDisp;
      el.appendChild(o);
    });
}

window.showAdminTab = tab => {
  ['overview','videos','quizzes','groups','students','groupvideos'].forEach(t => {
    const sec = $(t+'-section'); if (sec) sec.style.display = t === tab ? 'block' : 'none';
    const btn = $('smenu-'+t);  if (btn) btn.classList.toggle('on', t === tab);
  });
  if (tab === 'groups')      renderGroupsList();
  if (tab === 'students')    renderStudentsList();
  if (tab === 'overview')    loadOverviewStats();
  if (tab === 'groupvideos') initGroupVideosBrowser();
};

/* ── Overview ── */
async function loadOverviewStats() {
  try {
    const [studSnap, vidSnap, grpSnap, quizSnap] = await Promise.all([
      getDocs(query(collection(db,'users'), where('role','==','student'))),
      getDocs(collection(db,'videos')),
      getDocs(collection(db,'groups')),
      getDocs(collection(db,'quizzes'))
    ]);
    $('stat-students').textContent = studSnap.size;
    $('stat-videos').textContent   = vidSnap.size;
    $('stat-groups').textContent   = grpSnap.size;
    $('stat-quizzes').textContent  = quizSnap.size;
    await loadWatchActivity();
    await loadTopStudents();
  } catch(_) {}
}

async function loadWatchActivity() {
  const container = $('watch-activity');
  try {
    const snap = await getDocs(collection(db,'progress'));
    if (snap.empty) {
      container.innerHTML = '<div style="color:var(--text3);font-size:.8rem;padding:.5rem">لا توجد بيانات مشاهدة بعد.</div>';
      return;
    }
    const rows = [];
    snap.forEach(d => {
      const cnt = Object.keys(d.data().watched || {}).length;
      rows.push({ uid: d.id, count: cnt });
    });
    rows.sort((a,b) => b.count - a.count);
    const maxCount    = rows[0]?.count || 1;
    const totalVSnap  = await getDocs(collection(db,'videos'));
    const totalVideos = totalVSnap.size;
    container.innerHTML = '';
    rows.forEach(r => {
      const stu  = ALL_STUDENTS.find(s => s.uid === r.uid);
      const name = stu ? stu.name : '(محذوف)';
      const pct  = Math.round((r.count / maxCount) * 100);
      const row  = document.createElement('div');
      row.className = 'ac-row';
      row.innerHTML =
        '<div class="ac-label" title="' + name + '">' + (name.length > 12 ? name.slice(0,12)+'…' : name) + '</div>' +
        '<div class="ac-bar-wrap"><div class="ac-bar" style="width:' + pct + '%"></div></div>' +
        '<div class="ac-count">' + r.count + (totalVideos ? '/'+totalVideos : '') + '</div>';
      container.appendChild(row);
    });
  } catch(_) {
    container.innerHTML = '<div style="color:var(--text3);font-size:.8rem">لا بيانات</div>';
  }
}

async function loadTopStudents() {
  const container = $('top-students');
  try {
    const snap   = await getDocs(collection(db,'quizResults'));
    const ranked = [];
    snap.forEach(d => {
      const results = d.data().results || {};
      const scores  = Object.values(results).map(r => r.score);
      if (!scores.length) return;
      const avg = Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
      const stu = ALL_STUDENTS.find(s => s.uid === d.id);
      if (stu) ranked.push({ name: stu.name, avg });
    });
    ranked.sort((a,b) => b.avg - a.avg);
    container.innerHTML = '';
    if (!ranked.length) {
      container.innerHTML = '<div style="color:var(--text3);font-size:.8rem;padding:.5rem">لا بيانات بعد</div>';
      return;
    }
    ranked.slice(0,5).forEach((s,i) => {
      const rankClass = i===0?'gold':i===1?'silver':i===2?'bronze':'';
      const icon      = i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1);
      const row = document.createElement('div');
      row.className = 'tl-row';
      row.innerHTML =
        '<div class="tl-rank ' + rankClass + '">' + icon + '</div>' +
        '<div class="tl-name">' + s.name + '</div>' +
        '<div class="tl-score">' + s.avg + '%</div>';
      container.appendChild(row);
    });
  } catch(_) {}
}

/* ── Videos ── */
window.switchSource = type => {
  currentSource = type;
  $('stab-yt').classList.toggle('on', type === 'youtube');
  $('stab-gd').classList.toggle('on', type === 'gdrive');
  $('hint-yt').style.display  = type === 'youtube' ? 'block' : 'none';
  $('hint-gd').style.display  = type === 'gdrive'  ? 'block' : 'none';
  $('vurl-label').textContent = type === 'youtube'  ? 'رابط YouTube او ID' : 'رابط Google Drive';
  $('vu').placeholder         = type === 'youtube'
    ? 'https://youtube.com/watch?v=...'
    : 'https://drive.google.com/file/d/.../view';
};
window.updateAdminGroups = () => populateGroupSelect('vg', $('vc').value, true);
window.filterAdminGroups = () => { populateGroupSelect('fg2', $('fc').value, true); loadAdminVideos(); };

window.addVideo = async () => {
  const title  = $('vt').value.trim();
  const rawUrl = $('vu').value.trim();
  const desc   = $('vd').value.trim();
  const course = $('vc').value;
  const group  = $('vg').value;
  if (!title || !rawUrl) return alert('أدخل العنوان والرابط.');
  let data = { title, description: desc, course, group, addedAt: new Date().toISOString() };
  if (currentSource === 'youtube') {
    const id = extractYTId(rawUrl);
    if (!id) return alert('رابط YouTube غير صالح.');
    data.type = 'youtube'; data.ytId = id;
  } else {
    const id = extractDriveId(rawUrl);
    if (!id) return alert('رابط Google Drive غير صالح.');
    data.type = 'gdrive'; data.driveId = id;
  }
  try {
    await addDoc(collection(db,'videos'), data);
    $('vt').value = ''; $('vu').value = ''; $('vd').value = '';
    showOk('تم اضافة الفيديو!');
    loadAdminVideos();
  } catch(e) { alert(e.message); }
};

window.loadAdminVideos = async () => {
  const fc  = $('fc');  if (!fc)  return;
  const fg2 = $('fg2'); if (!fg2) return;
  const list = $('avl'); if (!list) return;

  const course = fc.value;
  const group  = fg2.value;
  list.innerHTML = '<div style="color:var(--text3);font-size:.82rem">جارٍ التحميل…</div>';
  try {
    const constraints = [where('course','==', course)];
    if (group && group !== 'all') constraints.push(where('group','==', group));
    const snap = await getDocs(query(collection(db,'videos'), ...constraints));
    if (snap.empty) { list.innerHTML = '<div style="color:var(--text3);font-size:.82rem">لا توجد فيديوهات.</div>'; return; }
    list.innerHTML = '';
    snap.forEach(d => {
      const v     = d.data();
      const rawId = v.type === 'gdrive' ? v.driveId : v.ytId;
      const url   = buildVideoUrl(v.type, rawId);
      const badge = v.type === 'gdrive'
        ? '<span class="vtype-badge vtype-gd">📁 Drive</span>'
        : '<span class="vtype-badge vtype-yt">▶ YT</span>';
      const item  = document.createElement('div');
      item.className = 'vi';
      const safeT = v.title.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      const safeD = (v.description||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      item.innerHTML =
        '<div class="vi-info">' +
          '<div class="vi-t">' + v.title + badge + '</div>' +
          '<div class="vi-m">' + groupLabel(v.group) + ' · ' + courseLabel(v.course) + '</div>' +
          // ── Video link row ──
          '<div class="vi-link-row">' +
            '<a href="' + url + '" target="_blank" class="vi-link-anchor" title="' + url + '">' +
              (v.type === 'gdrive' ? '📁 ' : '▶ ') + rawId +
            '</a>' +
            '<button class="btn-copy-sm" onclick="navigator.clipboard.writeText(\'' + url.replace(/'/g,"\\'") + '\').then(()=>showOk(\'تم نسخ الرابط!\'))" title="نسخ">📋</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:.4rem;flex-shrink:0">' +
          '<button class="btn-edit" onclick="openEditVideoModal(\'' + d.id + '\',\'' + safeT + '\',\'' + safeD + '\',\'' + v.course + '\',\'' + v.group + '\',\'' + (v.type||'youtube') + '\',\'' + rawId + '\')">تعديل</button>' +
          '<button class="btn-del"  onclick="delVideo(\'' + d.id + '\')">حذف</button>' +
        '</div>';
      list.appendChild(item);
    });
  } catch(e) { list.innerHTML = '<div style="color:var(--red);font-size:.82rem">' + e.message + '</div>'; }
};

window.delVideo = async id => {
  if (!confirm('حذف هذا الفيديو؟')) return;
  await deleteDoc(doc(db,'videos', id));
  loadAdminVideos();
  const gvSel = $('gv-group-select');
  if (gvSel?.value) loadGroupVideos();
};

/* ── Edit video modal ── */
window.openEditVideoModal = (id, title, desc, course, group, type = 'youtube', rawId = '') => {
  $('ev-id').value    = id;
  $('ev-title').value = title;
  $('ev-desc').value  = desc;
  $('ev-type').value  = type;
  $('ev-raw-id').value = rawId;
  populateCourseSelect('ev-course');
  populateGroupSelect('ev-group', '', false);
  setTimeout(() => {
    const cs = $('ev-course'); if (cs) cs.value = course;
    const gs = $('ev-group');  if (gs) gs.value = group;
  }, 0);

  // Show video link
  if (rawId && type) {
    const url = buildVideoUrl(type, rawId);
    $('ev-link-text').textContent = rawId;
    $('ev-link-open').href = url;
    $('ev-raw-id').dataset.url = url;
    $('ev-link-wrap').style.display = 'block';
  } else {
    $('ev-link-wrap').style.display = 'none';
  }

  $('edit-video-modal').style.display = 'flex';
};
window.closeEditVideoModal = () => { $('edit-video-modal').style.display = 'none'; };
window.closeEditVideoOut   = e  => { if (e.target.id === 'edit-video-modal') closeEditVideoModal(); };

window.copyVideoLink = () => {
  const url = $('ev-raw-id').dataset.url || '';
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => showOk('تم نسخ الرابط!'));
};

window.saveEditVideo = async () => {
  const id     = $('ev-id').value;
  const title  = $('ev-title').value.trim();
  const desc   = $('ev-desc').value.trim();
  const course = $('ev-course').value;
  const group  = $('ev-group').value;
  if (!title) return alert('أدخل عنوان الفيديو.');
  try {
    await updateDoc(doc(db,'videos', id), { title, description: desc, course, group });
    closeEditVideoModal();
    showOk('تم تحديث الفيديو!');
    loadAdminVideos();
    const gvSel = $('gv-group-select');
    if (gvSel?.value) loadGroupVideos();
  } catch(e) { alert(e.message); }
};

/* ── Quizzes ── */
let questionIndex = 0;
window.addQuestion = () => {
  const container = $('questions-container');
  const block = document.createElement('div');
  block.className = 'question-block';
  block.dataset.qi = questionIndex;
  block.innerHTML =
    '<div class="qb-q-header">' +
      '<span class="qb-q-num">السؤال ' + (questionIndex+1) + '</span>' +
      '<button class="btn-del" onclick="this.closest(\'.question-block\').remove()">×</button>' +
    '</div>' +
    '<input class="qb-q-input" type="text" placeholder="نص السؤال…" data-field="text"/>' +
    '<div class="qb-options">' +
      [0,1,2,3].map(i =>
        '<div class="qb-opt">' +
          '<input type="radio" name="correct_' + questionIndex + '" value="' + i + '"/>' +
          '<input class="qb-opt-input" type="text" placeholder="الخيار ' + String.fromCharCode(65+i) + '…" data-field="opt' + i + '"/>' +
        '</div>'
      ).join('') +
    '</div>' +
    '<div style="font-size:.72rem;color:var(--text3);margin-top:.5rem">حدد الاجابة الصحيحة بالاختيار من اليسار</div>';
  container.appendChild(block);
  questionIndex++;
};

window.saveQuiz = async () => {
  const title  = $('qt').value.trim();
  const course = $('qc').value;
  const group  = $('qg').value;
  const dur    = parseInt($('qdur').value) || 30;
  if (!title) return alert('أدخل عنوان الاختبار.');
  const blocks = $('questions-container').querySelectorAll('.question-block');
  if (!blocks.length) return alert('أضف سؤالاً واحداً على الأقل.');
  const questions = []; let valid = true;
  blocks.forEach(b => {
    const text      = b.querySelector('[data-field=text]').value.trim();
    const opts      = [0,1,2,3].map(i => b.querySelector('[data-field=opt'+i+']').value.trim());
    const correctEl = b.querySelector('input[type=radio]:checked');
    if (!text || opts.some(o=>!o) || !correctEl) { valid = false; return; }
    questions.push({ text, options: opts, correct: parseInt(correctEl.value) });
  });
  if (!valid) return alert('يرجى ملء جميع الأسئلة واختيار الإجابة الصحيحة.');
  try {
    await addDoc(collection(db,'quizzes'), {
      title, course, group, duration: dur, questions,
      createdAt: new Date().toISOString()
    });
    $('qt').value = ''; $('qdur').value = 30;
    $('questions-container').innerHTML = '';
    questionIndex = 0;
    showOk('تم حفظ الاختبار!');
    loadAdminQuizzes();
  } catch(e) { alert(e.message); }
};

async function loadAdminQuizzes() {
  const list = $('admin-quiz-list'); if (!list) return;
  list.innerHTML = '<div style="color:var(--text3);font-size:.82rem">جارٍ التحميل…</div>';
  try {
    const snap = await getDocs(collection(db,'quizzes'));
    if (snap.empty) { list.innerHTML = '<div style="color:var(--text3);font-size:.82rem">لا توجد اختبارات.</div>'; return; }
    list.innerHTML = '';
    snap.forEach(d => {
      const q    = d.data();
      const item = document.createElement('div');
      item.className = 'vi';
      item.innerHTML =
        '<div class="vi-info">' +
          '<div class="vi-t">' + q.title + '</div>' +
          '<div class="vi-m">' + (q.questions||[]).length + ' سؤال · ' + q.duration + ' دق · ' + groupLabel(q.group) + '</div>' +
        '</div>' +
        '<button class="btn-del" onclick="delQuiz(\'' + d.id + '\')">حذف</button>';
      list.appendChild(item);
    });
  } catch(e) { list.innerHTML = '<div style="color:var(--red);font-size:.82rem">' + e.message + '</div>'; }
}
window.delQuiz = async id => {
  if (!confirm('حذف هذا الاختبار؟')) return;
  await deleteDoc(doc(db,'quizzes', id)); loadAdminQuizzes();
};

/* ── Groups ── */
window.createGroup = async () => {
  const name     = $('gname').value.trim();
  const courseId = $('gcourse').value;
  if (!name) return alert('أدخل اسم المجموعة.');
  await addDoc(collection(db,'groups'), { name, courseId, createdAt: new Date().toISOString() });
  $('gname').value = '';
  await loadGroups();
  populateGroupSelect('vg',  $('vc').value, true);
  populateGroupSelect('fg2', '', true);
  populateGroupSelect('qg',  '', true);
  populateGroupSelect('gv-group-select', '', false);
  populateGroupSelect('ev-group', '', false);
  buildGroupCheckboxes('add-student-groups');
  renderStudentGroupFilter();
  renderGroupsList();
  showOk('تم انشاء المجموعة!');
};

async function renderGroupsList() {
  await loadGroups();
  const c      = $('groups-list');
  const groups = Object.values(GROUPS);
  if (!groups.length) { c.innerHTML = '<div class="empty-state"><p>لا توجد مجموعات بعد.</p></div>'; return; }
  c.innerHTML = '';
  groups.forEach(g => {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML =
      '<div class="gc-header"><div class="gc-name">👥 ' + g.name + '</div><span class="gc-course">' + courseLabel(g.courseId) + '</span></div>' +
      '<div class="gc-count">ID: ' + g.id + '</div>' +
      '<button class="gc-del" onclick="deleteGroup(\'' + g.id + '\')">✕</button>';
    c.appendChild(card);
  });
}
window.deleteGroup = async id => {
  if (!confirm('حذف هذه المجموعة؟')) return;
  await deleteDoc(doc(db,'groups', id));
  await loadGroups();
  populateGroupSelect('vg',  $('vc').value, true);
  populateGroupSelect('fg2', '', true);
  renderGroupsList();
};

/* ── Students ── */
function buildGroupCheckboxes(containerId, selected = []) {
  const c = $(containerId); c.innerHTML = '';
  const groups = Object.values(GROUPS);
  if (!groups.length) {
    c.innerHTML = '<div style="color:var(--text3);font-size:.8rem;padding:.35rem">لا توجد مجموعات</div>';
    return;
  }
  groups.forEach(g => {
    const label = document.createElement('label');
    const cb    = document.createElement('input');
    cb.type = 'checkbox'; cb.value = g.id; cb.dataset.group = g.id;
    if (selected.includes(g.id)) cb.checked = true;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + g.name + ' (' + courseLabel(g.courseId) + ')'));
    c.appendChild(label);
  });
}
function renderStudentGroupFilter() {
  const sel = $('student-group-filter');
  sel.innerHTML = '<option value="">كل المجموعات</option>';
  Object.values(GROUPS).forEach(g => {
    const o = document.createElement('option');
    o.value = g.id; o.textContent = g.name;
    sel.appendChild(o);
  });
}
function getChecked(containerId) {
  return [...$(containerId).querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
}

window.addStudent = async () => {
  const name   = $('sn').value.trim();
  const email  = $('se').value.trim().toLowerCase();
  const pass   = $('sp').value;
  const groups = getChecked('add-student-groups');
  if (!name||!email||!pass) return alert('يرجى ملء كل الحقول.');
  if (pass.length < 6) return alert('كلمة المرور 6 أحرف على الأقل.');
  if (!groups.length) return alert('اختر مجموعة واحدة على الأقل.');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db,'users',cred.user.uid), {
      name, email, groups, role:'student', createdAt: new Date().toISOString()
    });
    await loadStudents(); renderStudentsList();
    $('sn').value = ''; $('se').value = ''; $('sp').value = '';
    buildGroupCheckboxes('add-student-groups');
    showOk('تمت اضافة الطالب ' + name + '!');
  } catch(e) {
    alert(e.code === 'auth/email-already-in-use' ? 'البريد مستخدم مسبقا.' : e.message);
  }
};

window.renderStudentsList = () => {
  const q    = $('student-search').value.trim().toLowerCase();
  const gf   = $('student-group-filter').value;
  const list = $('students-list');
  let students = [...ALL_STUDENTS];
  if (q)  students = students.filter(s => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  if (gf) students = students.filter(s => (s.groups||[]).includes(gf));
  if (!students.length) {
    list.innerHTML = '<div style="color:var(--text3);font-size:.82rem;padding:.5rem">لا يوجد طلاب.</div>';
    return;
  }
  list.innerHTML = '';
  students.forEach(s => {
    const row    = document.createElement('div');
    row.className = 'student-row';
    const badges = (s.groups||[]).map(gid => '<span class="sr-badge">' + groupLabel(gid) + '</span>').join('');
    const safeN  = s.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    row.innerHTML =
      '<div class="sr-info">' +
        '<div class="sr-name">' + s.name + '</div>' +
        '<div class="sr-email">' + s.email + '</div>' +
        '<div class="sr-badges">' + (badges||'<span style="color:var(--text3);font-size:.72rem">بدون مجموعات</span>') + '</div>' +
      '</div>' +
      '<div class="sr-actions">' +
        '<button class="btn-edit" onclick="openEditModal(\'' + s.uid + '\')">تعديل</button>' +
        '<button class="btn-del"  onclick="deleteStudent(\'' + s.uid + '\',\'' + safeN + '\')">حذف</button>' +
      '</div>';
    list.appendChild(row);
  });
};

window.openEditModal = uid => {
  const s = ALL_STUDENTS.find(x => x.uid === uid); if (!s) return;
  $('edit-uid').value  = uid;
  $('edit-name').value = s.name;
  buildGroupCheckboxes('edit-student-groups', s.groups||[]);
  $('edit-modal').style.display = 'flex';
};
window.closeEditModal = () => { $('edit-modal').style.display = 'none'; };
window.closeEditOut   = e  => { if (e.target.id === 'edit-modal') closeEditModal(); };
window.saveEditStudent = async () => {
  const uid    = $('edit-uid').value;
  const name   = $('edit-name').value.trim();
  const groups = getChecked('edit-student-groups');
  if (!name) return alert('أدخل اسم الطالب.');
  if (!groups.length) return alert('اختر مجموعة واحدة على الأقل.');
  try {
    await updateDoc(doc(db,'users', uid), { name, groups });
    const i = ALL_STUDENTS.findIndex(s => s.uid === uid);
    if (i > -1) { ALL_STUDENTS[i].name = name; ALL_STUDENTS[i].groups = groups; }
    renderStudentsList(); closeEditModal(); showOk('تم تحديث بيانات الطالب!');
  } catch(e) { alert(e.message); }
};
window.deleteStudent = async (uid, name) => {
  if (!confirm('حذف الطالب ' + name + '؟')) return;
  await deleteDoc(doc(db,'users', uid));
  ALL_STUDENTS = ALL_STUDENTS.filter(s => s.uid !== uid);
  renderStudentsList();
};

/* ══════════════════════════════════════════
   GROUP VIDEOS BROWSER
══════════════════════════════════════════ */
function initGroupVideosBrowser() {
  populateGroupSelect('gv-group-select', '', false);
  const gid = $('gv-group-select').value;
  if (!gid) {
    $('gv-container').innerHTML =
      '<div class="gv-empty"><div class="ei">👆</div><p>اختر مجموعة لعرض فيديوهاتها</p></div>';
  } else {
    loadGroupVideos();
  }
}

window.loadGroupVideos = async () => {
  const gid       = $('gv-group-select').value;
  const container = $('gv-container');
  if (!gid) {
    container.innerHTML =
      '<div class="gv-empty"><div class="ei">👆</div><p>اختر مجموعة لعرض فيديوهاتها</p></div>';
    return;
  }
  container.innerHTML = '<div class="loading-state"><div class="spin"></div><p>جارٍ التحميل…</p></div>';

  try {
    const g        = GROUPS[gid];
    const courseId = g?.courseId || 'all';

    const [s1,s2,s3] = await Promise.all([
      getDocs(query(collection(db,'videos'), where('course','==',courseId), where('group','==',gid))),
      getDocs(query(collection(db,'videos'), where('course','==',courseId), where('group','==','all'))),
      getDocs(query(collection(db,'videos'), where('course','==','all'),    where('group','==','all')))
    ]);

    const seen = new Set(); const videos = [];
    [s1,s2,s3].forEach(snap => snap.forEach(d => {
      if (!seen.has(d.id)) { seen.add(d.id); videos.push({ id: d.id, ...d.data() }); }
    }));

    if (!videos.length) {
      container.innerHTML =
        '<div class="gv-empty"><div class="ei">📭</div><p>لا توجد فيديوهات في هذه المجموعة بعد.</p></div>';
      return;
    }

    container.innerHTML = '';
    container.style.display = 'grid';
    videos.forEach((v, i) => {
      const isDrive = v.type === 'gdrive';
      const rawId   = isDrive ? v.driveId : v.ytId;
      const url     = buildVideoUrl(v.type, rawId);
      const card    = document.createElement('div');
      card.className = 'gv-card';
      card.style.animationDelay = (i * 0.05) + 's';
      const safeT = v.title.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
      const safeD = (v.description||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
      const safeUrl = url.replace(/'/g,"\\'");
      card.innerHTML =
        '<div class="gv-thumb">' +
          (isDrive
            ? '<div class="thumb-gd"><div class="thumb-gd-icon">📁</div><div class="thumb-gd-label">Google Drive</div></div>'
            : '<img src="https://img.youtube.com/vi/' + v.ytId + '/mqdefault.jpg" alt="' + safeT + '" loading="lazy"/>'
          ) +
        '</div>' +
        '<div class="gv-body">' +
          '<div class="gv-title">' + v.title + '</div>' +
          '<div class="gv-meta">' + courseLabel(v.course) + ' · ' + groupLabel(v.group) + '</div>' +
          // Link row in group video card
          '<div class="vi-link-row" style="margin-bottom:.6rem">' +
            '<a href="' + url + '" target="_blank" class="vi-link-anchor" title="' + url + '">' +
              (isDrive ? '📁 ' : '▶ ') + (rawId.length > 24 ? rawId.slice(0,24)+'…' : rawId) +
            '</a>' +
            '<button class="btn-copy-sm" onclick="navigator.clipboard.writeText(\'' + safeUrl + '\').then(()=>showOk(\'تم نسخ الرابط!\'))" title="نسخ">📋</button>' +
          '</div>' +
          '<div class="gv-actions">' +
            '<button class="btn-edit-vid" onclick="openEditVideoModal(\'' + v.id + '\',\'' + safeT + '\',\'' + safeD + '\',\'' + v.course + '\',\'' + v.group + '\',\'' + (v.type||'youtube') + '\',\'' + rawId + '\')">تعديل</button>' +
            '<button class="btn-del-vid"  onclick="delVideoFromBrowser(\'' + v.id + '\')">حذف</button>' +
          '</div>' +
        '</div>';
      container.appendChild(card);
    });
  } catch(e) {
    container.innerHTML = '<div class="gv-empty"><p>خطأ: ' + e.message + '</p></div>';
  }
};

window.delVideoFromBrowser = async id => {
  if (!confirm('حذف هذا الفيديو؟')) return;
  try {
    await deleteDoc(doc(db,'videos', id));
    showOk('تم حذف الفيديو!');
    loadGroupVideos();
    loadAdminVideos();
  } catch(e) { alert(e.message); }
};
