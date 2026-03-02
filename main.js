
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, addDoc, deleteDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA1Z5LkTwaVL_QM5IWiDs4uNKnT34r1T60",
  authDomain: "edustream-42dff.firebaseapp.com",
  projectId: "edustream-42dff",
  storageBucket: "edustream-42dff.firebasestorage.app",
  messagingSenderId: "185392712686",
  appId: "1:185392712686:web:3611e66f93007413e79cff"
};
const ADMIN_SECRET = "EduAdmin2024!";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = id => document.getElementById(id);
const showErr = m => { const e=$('aerr'); e.textContent=m; e.style.display='block'; setTimeout(()=>e.style.display='none',4500); };
const showOk = m => { const e=$('aok'); e.textContent=m; e.style.display='block'; setTimeout(()=>e.style.display='none',4000); };

let COURSES = {math:'Mathematics',physics:'Physics',cs:'Computer Science',chemistry:'Chemistry',biology:'Biology',english:'English'};
let GROUPS = {};
let ALL_STUDENTS = [];
let currentSource = 'youtube';
let currentUser = null;
let currentUserData = null;

async function loadGroups() {
  GROUPS = {};
  const snap = await getDocs(collection(db,'groups'));
  snap.forEach(d => { GROUPS[d.id] = {...d.data(), id: d.id}; });
}

async function loadStudents() {
  ALL_STUDENTS = [];
  const snap = await getDocs(query(collection(db,'users'), where('role','==','student')));
  snap.forEach(d => ALL_STUDENTS.push({uid: d.id, ...d.data()}));
}

function courseLabel(c) { return c==='all' ? 'All Courses' : (COURSES[c]||c); }
function groupLabel(g) { return g==='all' ? 'All Groups' : (GROUPS[g]?.name || g); }

function groupEmoji(name='') {
  const emojis = ['📘','📗','📙','📕','📓','📔','🟦','🟩','🟧','🟥'];
  let h=0; for(let c of name) h=(h*31+c.charCodeAt(0))&0xffff;
  return emojis[h % emojis.length];
}

window.switchTab = t => {
  $('lf').style.display = t==='l' ? 'block' : 'none';
  $('af').style.display = t==='a' ? 'block' : 'none';
  ['l','a'].forEach(x => $('tab-'+x).classList.toggle('on', x===t));
};

window.toggleAdminReg = show => {
  $('admin-login-form').style.display = show ? 'none' : 'block';
  $('admin-reg-form').style.display = show ? 'block': 'none';
};

window.doLogin = async () => {
  const e = $('le').value.trim().toLowerCase(), p = $('lp').value;
  if (!e||!p) return showErr('Enter email and password.');
  try { await signInWithEmailAndPassword(auth, e, p); }
  catch(ex) {
    const m = {'auth/user-not-found':'No account found.','auth/wrong-password':'Wrong password.','auth/invalid-credential':'Incorrect email or password.','auth/too-many-requests':'Too many attempts.'};
    showErr(m[ex.code]||ex.message);
  }
};

window.doAdminLogin = async () => {
  const e = $('ale').value.trim().toLowerCase(), p = $('alp').value;
  if (!e||!p) return showErr('Enter email and password.');
  try { await signInWithEmailAndPassword(auth, e, p); }
  catch(ex) {
    const m = {'auth/user-not-found':'No account found.','auth/wrong-password':'Wrong password.','auth/invalid-credential':'Incorrect email or password.'};
    showErr(m[ex.code]||ex.message);
  }
};

window.doAdminRegister = async () => {
  const name=$('an').value.trim(), email=$('ae').value.trim().toLowerCase(), pass=$('ap').value, secret=$('ask').value;
  if (!name||!email||!pass||!secret) return showErr('Fill in all fields.');
  if (pass.length<6) return showErr('Password min 6 chars.');
  if (secret!==ADMIN_SECRET) return showErr('❌ Incorrect secret key.');
  try {
    const c = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db,'users',c.user.uid),{name,email,groups:[],role:'admin',createdAt:new Date().toISOString()});
    showOk('✅ Admin created!');
  } catch(ex) {
    showErr({'auth/email-already-in-use':'Email already used.'}[ex.code]||ex.message);
  }
};

window.doLogout = () => signOut(auth);

onAuthStateChanged(auth, async user => {
  $('global-loader').classList.add('hide');
  if (!user) {
    $('auth-screen').style.display = 'flex';
    $('app-screen').style.display = 'none';
    return;
  }
  $('auth-screen').style.display = 'none';
  $('app-screen').style.display = 'block';

  await loadGroups();

  const snap = await getDoc(doc(db,'users',user.uid));
  if (!snap.exists()) { await signOut(auth); return; }
  const u = snap.data();
  currentUser = user;
  currentUserData = u;

  $('nName').textContent = u.name;

  if (u.role === 'admin') {
    $('adminChip').style.display = 'flex';
    $('admin-panel').style.display = 'block';
    $('group-picker').style.display = 'none';
    $('student-content').style.display = 'none';
    $('groupChip').style.display = 'none';
    await initAdminPanel();
  } else {
    $('adminChip').style.display = 'none';
    showGroupPicker(u);
  }
});

function showGroupPicker(u) {
  $('admin-panel').style.display = 'none';
  $('student-content').style.display = 'none';
  $('group-picker').style.display = 'flex';
  $('groupChip').style.display = 'none';

  $('gp-hello').textContent = `Welcome back, ${u.name}! 👋`;

  const groups = (u.groups || []);
  const grid = $('gp-grid');

  if (!groups.length) {
    grid.innerHTML = '<div class="empty"><div class="ei">📭</div><p>You have not been assigned to any group yet.<br>Contact your admin.</p></div>';
    return;
  }

  grid.innerHTML = '';
  groups.forEach((gid, i) => {
    const g = GROUPS[gid];
    if (!g) return;
    const card = document.createElement('div');
    card.className = 'gp-card';
    card.style.animationDelay = (i * .08) + 's';
    card.innerHTML = `
      <div class="gp-ic">${groupEmoji(g.name)}</div>
      <div class="gp-name">${g.name}</div>
      <div class="gp-course">${courseLabel(g.courseId)}</div>
      <div class="gp-arrow">→</div>`;
    card.onclick = () => enterGroup(gid, g);
    grid.appendChild(card);
  });
}

function enterGroup(gid, g) {
  $('group-picker').style.display = 'none';
  $('student-content').style.display = 'block';
  $('groupChip').style.display = 'flex';
  $('nGroup').textContent = g.name;
  $('swelcome').textContent = `${currentUserData.name}`;
  $('sct').textContent = courseLabel(g.courseId);
  $('sgt').textContent = g.name;
  loadStudentVideos(g.courseId, gid);
}

window.backToGroupPicker = () => {
  $('student-content').style.display = 'none';
  $('groupChip').style.display = 'none';
  showGroupPicker(currentUserData);
};

async function loadStudentVideos(courseId, groupId) {
  const grid = $('vgrid');
  grid.innerHTML = '<div class="loading"><div class="spin"></div>Loading videos…</div>';
  try {
    const queries = [
      getDocs(query(collection(db,'videos'), where('course','==',courseId), where('group','==',groupId))),
      getDocs(query(collection(db,'videos'), where('course','==',courseId), where('group','==','all'))),
      getDocs(query(collection(db,'videos'), where('course','==','all'), where('group','==','all'))),
    ];
    const results = await Promise.all(queries);
    const seen = new Set(), docs = [];
    results.forEach(s => s.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); docs.push(d); } }));

    if (!docs.length) {
      grid.innerHTML = '<div class="empty"><div class="ei">📭</div><p>No videos in this group yet.</p></div>';
      return;
    }
    grid.innerHTML = '';
    docs.forEach((d, i) => {
      const v = d.data(), card = document.createElement('div');
      card.className = 'vcard';
      card.style.animationDelay = (i * .07) + 's';
      const isGD = v.type === 'gdrive';
      card.innerHTML = isGD
        ? `<div class="thumb"><div class="thumb-gd"><div class="thumb-gd-icon">📁</div><div class="thumb-gd-label">Google Drive</div></div>
        <div class="pb pb-gd">▶</div></div>`
        : `<div class="thumb"><img src="https://img.youtube.com/vi/${v.ytId}/mqdefault.jpg" alt="${v.title}" loading="lazy"/><div class="pb">▶</div></div>`;
      card.innerHTML += `<div class="vcb"><div class="vc-t">${v.title}</div><div class="vc-d">${v.description||''}</div></div>`;
      card.onclick = () => isGD ? openModalDrive(v.driveId, v.title, v.description) : openModalYT(v.ytId, v.title, v.description);
      grid.appendChild(card);
    });
  } catch(e) {
    grid.innerHTML = `<div class="empty"><p>Error: ${e.message}</p></div>`;
  }
}

async function initAdminPanel() {
  populateCourseSelect('vc');
  populateCourseSelect('fc');
  populateCourseSelect('gcourse');
  populateGroupSelect('vg','',true);
  populateGroupSelect('fg2','',true);
  await loadStudents();
  renderAddStudentGroups();
  renderStudentGroupFilter();
  window.loadAdminVideos();
}

function populateCourseSelect(id, includeAll=true) {
  const s = $(id); if (!s) return;
  s.innerHTML = '';
  if (includeAll) s.innerHTML = '<option value="all">All Courses</option>';
  Object.entries(COURSES).forEach(([k,v]) => {
    const o = document.createElement('option'); o.value=k; o.textContent=v; s.appendChild(o);
  });
}

function populateGroupSelect(id, courseFilter='', includeAll=true) {
  const s = $(id); if (!s) return;
  s.innerHTML = '';
  if (includeAll) s.innerHTML = '<option value="all">All Groups</option>';
  Object.values(GROUPS)
    .filter(g => !courseFilter || courseFilter==='all' || g.courseId===courseFilter || g.courseId==='all')
    .forEach(g => {
      const o = document.createElement('option');
      o.value = g.id;
      o.textContent = g.name + (courseFilter==='all'||!courseFilter ? ` (${courseLabel(g.courseId)})` : '');
      s.appendChild(o);
    });
}

window.showAdminTab = tab => {
  ['videos','groups','students'].forEach(t => {
    $(t+'-section').style.display = t===tab ? 'block' : 'none';
  });
  document.querySelectorAll('.atab').forEach((el,i) => {
    el.classList.toggle('on', ['videos','groups','students'][i]===tab);
  });
  if (tab==='groups') renderGroupsList();
  if (tab==='students') renderStudentsList();
};

window.switchSource = type => {
  currentSource = type;
  $('stab-yt').classList.toggle('on', type==='youtube');
  $('stab-gd').classList.toggle('on', type==='gdrive');
  $('stab-gd').classList.toggle('gdrive', type==='gdrive');
  $('hint-yt').style.display = type==='youtube' ? 'block' : 'none';
  $('hint-gd').style.display = type==='gdrive' ? 'block' : 'none';
  $('vurl-label').textContent = type==='youtube' ? 'YouTube URL or ID' : 'Google Drive Link / File ID';
  $('vu').placeholder = type==='youtube' ? 'https://youtube.com/watch?v=...' : 'https://drive.google.com/file/d/.../view';
};

window.updateAdminGroups = () => populateGroupSelect('vg', $('vc').value, true);
window.filterAdminGroups = () => { populateGroupSelect('fg2', $('fc').value, true); loadAdminVideos(); };

window.addVideo = async () => {
  const title=$('vt').value.trim(), raw=$('vu').value.trim(), desc=$('vd').value.trim();
  const course=$('vc').value, group=$('vg').value;
  if (!title||!raw) return alert('Enter title and URL.');
  let data = {title, description:desc, course, group, addedAt:new Date().toISOString()};
  if (currentSource==='youtube') {
    const id = extractYTId(raw);
    if (!id) return alert('Invalid YouTube URL.');
    data.type='youtube'; data.ytId=id;
  } else {
    const id = extractDriveId(raw);
    if (!id) return alert('Invalid Google Drive link.');
    data.type='gdrive'; data.driveId=id;
  }
  try {
    await addDoc(collection(db,'videos'), data);
    $('vt').value=''; $('vu').value=''; $('vd').value='';
    showOk('✅ Video added!');
    loadAdminVideos();
  } catch(e) { alert(e.message); }
};

window.loadAdminVideos = async () => {
  const course=$('fc').value, group=$('fg2').value, list=$('avl');
  list.innerHTML = '<div style="color:var(--muted);font-size:.82rem">Loading…</div>';
  try {
    const c=[where('course','==',course)];
    if (group && group!=='all') c.push(where('group','==',group));
    const snap = await getDocs(query(collection(db,'videos'),...c));
    if (snap.empty) { list.innerHTML='<div style="color:var(--muted);font-size:.82rem">No videos found.</div>'; return; }
    list.innerHTML='';
    snap.forEach(d => {
      const v=d.data(), isGD=v.type==='gdrive';
      const badge = isGD
        ? `<span class="vtype-badge vtype-gd">📁 Drive</span>`
        : `<span class="vtype-badge vtype-yt">▶ YT</span>`;
      const item = document.createElement('div');
      item.className='vi';
      item.innerHTML=`<div class="vi-info"><div class="vi-t">${v.title}${badge}</div><div class="vi-m">${isGD?v.driveId:v.ytId} · ${groupLabel(v.group)} · ${courseLabel(v.course)}</div></div><button class="bd" onclick="delVideo('${d.id}')">Delete</button>`;
      list.appendChild(item);
    });
  } catch(e) { list.innerHTML=`<div style="color:#ff6b6b;font-size:.82rem">${e.message}</div>`; }
};

window.delVideo = async id => {
  if (!confirm('Delete this video?')) return;
  await deleteDoc(doc(db,'videos',id));
  loadAdminVideos();
};

window.createGroup = async () => {
  const name=$('gname').value.trim(), courseId=$('gcourse').value;
  if (!name) return alert('Enter group name.');
  await addDoc(collection(db,'groups'), {name, courseId, createdAt:new Date().toISOString()});
  $('gname').value='';
  await loadGroups();
  populateGroupSelect('vg',$('vc').value,true);
  populateGroupSelect('fg2','',true);
  renderAddStudentGroups();
  renderStudentGroupFilter();
  renderGroupsList();
  showOk('✅ Group created!');
};

async function renderGroupsList() {
  await loadGroups();
  const c=$('groups-list'), groups=Object.values(GROUPS);
  if (!groups.length) { c.innerHTML='<div style="color:var(--muted);padding:2rem;text-align:center">No groups yet.</div>'; return; }
  c.innerHTML='';
  groups.forEach(g => {
    const card=document.createElement('div'); card.className='group-card';
    card.innerHTML=`<div class="gc-header"><div class="gc-name">👥 ${g.name}</div><span class="gc-course">${courseLabel(g.courseId)}</span></div><div class="gc-count">ID: ${g.id}</div><button class="gc-del" onclick="deleteGroup('${g.id}')">✕</button>`;
    c.appendChild(card);
  });
}

window.deleteGroup = async id => {
  if (!confirm('Delete this group?')) return;
  await deleteDoc(doc(db,'groups',id));
  await loadGroups();
  populateGroupSelect('vg',$('vc').value,true);
  populateGroupSelect('fg2','',true);
  renderGroupsList();
};

function buildGroupCheckboxes(containerId, selectedIds=[]) {
  const c = $(containerId);
  c.innerHTML = '';
  const groups = Object.values(GROUPS);
  if (!groups.length) { c.innerHTML='<div style="color:var(--muted);font-size:.8rem;padding:.25rem .5rem">No groups yet.</div>'; return; }
  groups.forEach(g => {
    const lbl = document.createElement('label');
    const chk = document.createElement('input');
    chk.type='checkbox'; chk.value=g.id; chk.dataset.group=g.id;
    if (selectedIds.includes(g.id)) chk.checked=true;
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode(` ${g.name} (${courseLabel(g.courseId)})`));
    c.appendChild(lbl);
  });
}

function renderAddStudentGroups() { buildGroupCheckboxes('add-student-groups'); }

function renderStudentGroupFilter() {
  const s = $('student-group-filter');
  s.innerHTML = '<option value="">All Groups</option>';
  Object.values(GROUPS).forEach(g => {
    const o=document.createElement('option'); o.value=g.id; o.textContent=g.name; s.appendChild(o);
  });
}

function getCheckedGroups(containerId) {
  return [...$(containerId).querySelectorAll('input[type=checkbox]:checked')].map(c=>c.value);
}

window.addStudent = async () => {
  const name=$('sn').value.trim(), email=$('se').value.trim().toLowerCase(), pass=$('sp').value;
  const groups = getCheckedGroups('add-student-groups');
  if (!name||!email||!pass) return alert('Fill in all fields.');
  if (pass.length<6) return alert('Password min 6 chars.');
  if (!groups.length) return alert('Select at least one group.');
  try {
    const c = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db,'users',c.user.uid),{name,email,groups,role:'student',createdAt:new Date().toISOString()});
    await loadStudents();
    renderStudentsList();
    $('sn').value=''; $('se').value=''; $('sp').value='';
    buildGroupCheckboxes('add-student-groups');
    showOk(`✅ Student "${name}" added!`);
  } catch(e) {
    const m={'auth/email-already-in-use':'Email already in use.'};
    alert(m[e.code]||e.message);
  }
};

window.renderStudentsList = () => {
  const query = $('student-search').value.trim().toLowerCase();
  const gfilter = $('student-group-filter').value;
  const list = $('students-list');
  let students = [...ALL_STUDENTS];
  if (query) students = students.filter(s => s.name.toLowerCase().includes(query)||s.email.toLowerCase().includes(query));
  if (gfilter) students = students.filter(s => (s.groups||[]).includes(gfilter));
  if (!students.length) { list.innerHTML='<div style="color:var(--muted);font-size:.82rem;padding:.5rem">No students found.</div>'; return; }
  list.innerHTML='';
  students.forEach(s => {
    const row=document.createElement('div'); row.className='student-row';
    const badges = (s.groups||[]).map(gid => `<span class="sr-group-badge">${groupLabel(gid)}</span>`).join('');
    row.innerHTML=`
      <div class="sr-info">
        <div class="sr-name">${s.name}</div>
        <div class="sr-email">${s.email}</div>
        <div class="sr-badges">${badges||'<span style="color:var(--muted);font-size:.72rem">No groups</span>'}</div>
      </div>
      <div class="sr-actions">
        <button class="btn-edit" onclick="openEditModal('${s.uid}')">Edit</button>
        <button class="bd" onclick="deleteStudent('${s.uid}','${s.name}')">Delete</button>
      </div>`;
    list.appendChild(row);
  });
};

window.openEditModal = uid => {
  const s = ALL_STUDENTS.find(x=>x.uid===uid);
  if (!s) return;
  $('edit-uid').value = uid;
  $('edit-name').value = s.name;
  buildGroupCheckboxes('edit-student-groups', s.groups||[]);
  $('edit-modal').style.display='flex';
};

window.closeEditModal = () => { $('edit-modal').style.display='none'; };
window.closeEditOut = e => { if(e.target.id==='edit-modal') closeEditModal(); };

window.saveEditStudent = async () => {
  const uid = $('edit-uid').value;
  const name = $('edit-name').value.trim();
  const groups = getCheckedGroups('edit-student-groups');
  if (!name) return alert('Enter student name.');
  if (!groups.length) return alert('Select at least one group.');
  try {
    await updateDoc(doc(db,'users',uid), {name, groups});
    const idx = ALL_STUDENTS.findIndex(s=>s.uid===uid);
    if (idx>-1) { ALL_STUDENTS[idx].name=name; ALL_STUDENTS[idx].groups=groups; }
    renderStudentsList();
    closeEditModal();
    showOk('✅ Student updated!');
  } catch(e) { alert(e.message); }
};

window.deleteStudent = async (uid, name) => {
  if (!confirm(`Delete student "${name}"? This only removes their data, not their auth account.`)) return;
  await deleteDoc(doc(db,'users',uid));
  ALL_STUDENTS = ALL_STUDENTS.filter(s=>s.uid!==uid);
  renderStudentsList();
};

window.openModalYT = (id,title,desc) => {
  $('mt').textContent=title;
  $('mif').src=`https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
  $('md').textContent=desc||'';
  $('mopen').style.display='none';
  $('vmodal').style.display='flex';
};

window.openModalDrive = (fileId,title,desc) => {
  $('mt').textContent=title;
  $('mif').src=`https://drive.google.com/file/d/${fileId}/preview`;
  $('md').textContent=desc||'';
  $('mopen').href=`https://drive.google.com/file/d/${fileId}/view`;
  $('mopen').style.display='flex';
  $('vmodal').style.display='flex';
};

window.closeModal = () => { $('vmodal').style.display='none'; $('mif').src=''; };
window.closeOut = e => { if(e.target.id==='vmodal') closeModal(); };

function extractYTId(s) {
  s=s.trim();
  for(const r of [/(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/, /^([A-Za-z0-9_-]{11})$/]) {
    const m=s.match(r); if(m) return m[1];
  }
  return null;
}

function extractDriveId(input) {
  input=input.trim();
  const m1=input.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if(m1) return m1[1];
  const m2=input.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if(m2) return m2[1];
  if(/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input;
  return null;
}
