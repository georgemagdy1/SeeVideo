import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


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


const showErr = message => {
  const errorElement = $('aerr');
  errorElement.textContent = message;
  errorElement.style.display = 'block';
  setTimeout(() => {
    errorElement.style.display = 'none';
  }, 4500);
};


const showOk = message => {
  const successElement = $('aok');
  successElement.textContent = message;
  successElement.style.display = 'block';
  setTimeout(() => {
    successElement.style.display = 'none';
  }, 4000);
};

let COURSES = {
  math: 'Mathematics',
  physics: 'Physics',
  cs: 'Computer Science',
  chemistry: 'Chemistry',
  biology: 'Biology',
  english: 'English'
};

let GROUPS = {};
let ALL_STUDENTS = [];
let currentSource = 'youtube';
let currentUser = null;
let currentUserData = null;


async function loadGroups() {
  GROUPS = {};
  const snapshot = await getDocs(collection(db, 'groups'));
  snapshot.forEach(doc => {
    GROUPS[doc.id] = { ...doc.data(), id: doc.id };
  });
}


async function loadStudents() {
  ALL_STUDENTS = [];
  const snapshot = await getDocs(
    query(collection(db, 'users'), where('role', '==', 'student'))
  );
  snapshot.forEach(doc => {
    ALL_STUDENTS.push({ uid: doc.id, ...doc.data() });
  });
}


function courseLabel(courseCode) {
  return courseCode === 'all'
    ? 'All Courses'
    : COURSES[courseCode] || courseCode;
}


function groupLabel(groupId) {
  return groupId === 'all'
    ? 'All Groups'
    : GROUPS[groupId]?.name || groupId;
}


function groupEmoji(name = '') {
  const emojis = ['📘', '📗', '📙', '📕', '📓', '📔', '🟦', '🟩', '🟧', '🟥'];
  let hash = 0;
  for (let char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) & 0xffff;
  }
  return emojis[hash % emojis.length];
}


window.switchTab = tabType => {
  $('lf').style.display = tabType === 'l' ? 'block' : 'none';
  $('af').style.display = tabType === 'a' ? 'block' : 'none';

  ['l', 'a'].forEach(type => {
    $('tab-' + type).classList.toggle('on', type === tabType);
  });
};


window.toggleAdminReg = show => {
  $('admin-login-form').style.display = show ? 'none' : 'block';
  $('admin-reg-form').style.display = show ? 'block' : 'none';
};


window.doLogin = async () => {
  const email = $('le').value.trim().toLowerCase();
  const password = $('lp').value;

  if (!email || !password) {
    return showErr('Enter email and password.');
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    const errorMessages = {
      'auth/user-not-found': 'No account found.',
      'auth/wrong-password': 'Wrong password.',
      'auth/invalid-credential': 'Incorrect email or password.',
      'auth/too-many-requests': 'Too many attempts.'
    };
    showErr(errorMessages[error.code] || error.message);
  }
};


window.doAdminLogin = async () => {
  const email = $('ale').value.trim().toLowerCase();
  const password = $('alp').value;

  if (!email || !password) {
    return showErr('Enter email and password.');
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    const errorMessages = {
      'auth/user-not-found': 'No account found.',
      'auth/wrong-password': 'Wrong password.',
      'auth/invalid-credential': 'Incorrect email or password.'
    };
    showErr(errorMessages[error.code] || error.message);
  }
};


window.doAdminRegister = async () => {
  const name = $('an').value.trim();
  const email = $('ae').value.trim().toLowerCase();
  const password = $('ap').value;
  const secretKey = $('ask').value;

  if (!name || !email || !password || !secretKey) {
    return showErr('Fill in all fields.');
  }

  if (password.length < 6) {
    return showErr('Password min 6 chars.');
  }

  if (secretKey !== ADMIN_SECRET) {
    return showErr('❌ Incorrect secret key.');
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      name,
      email,
      groups: [],
      role: 'admin',
      createdAt: new Date().toISOString()
    });
    showOk('✅ Admin created!');
  } catch (error) {
    const errorMessages = {
      'auth/email-already-in-use': 'Email already used.'
    };
    showErr(errorMessages[error.code] || error.message);
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

  
  const userSnapshot = await getDoc(doc(db, 'users', user.uid));
  if (!userSnapshot.exists()) {
    await signOut(auth);
    return;
  }

  const userData = userSnapshot.data();
  currentUser = user;
  currentUserData = userData;

  $('nName').textContent = userData.name;

  if (userData.role === 'admin') {
    $('adminChip').style.display = 'flex';
    $('admin-panel').style.display = 'block';
    $('group-picker').style.display = 'none';
    $('student-content').style.display = 'none';
    $('groupChip').style.display = 'none';
    await initAdminPanel();
  } else {
    $('adminChip').style.display = 'none';
    showGroupPicker(userData);
  }
});

function showGroupPicker(userData) {
  $('admin-panel').style.display = 'none';
  $('student-content').style.display = 'none';
  $('group-picker').style.display = 'flex';
  $('groupChip').style.display = 'none';

  $('gp-hello').textContent = `Welcome back, ${userData.name}! 👋`;

  const userGroups = userData.groups || [];
  const grid = $('gp-grid');

  if (!userGroups.length) {
    grid.innerHTML = `
      <div class="empty">
        <div class="ei">📭</div>
        <p>You have not been assigned to any group yet.<br>Contact your admin.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = '';
  userGroups.forEach((groupId, index) => {
    const group = GROUPS[groupId];
    if (!group) return;

    const card = document.createElement('div');
    card.className = 'gp-card';
    card.style.animationDelay = (index * 0.08) + 's';
    card.innerHTML = `
      <div class="gp-ic">${groupEmoji(group.name)}</div>
      <div class="gp-name">${group.name}</div>
      <div class="gp-course">${courseLabel(group.courseId)}</div>
      <div class="gp-arrow">→</div>
    `;
    card.onclick = () => enterGroup(groupId, group);
    grid.appendChild(card);
  });
}


function enterGroup(groupId, groupData) {
  $('group-picker').style.display = 'none';
  $('student-content').style.display = 'block';
  $('groupChip').style.display = 'flex';

  $('nGroup').textContent = groupData.name;
  $('swelcome').textContent = currentUserData.name;
  $('sct').textContent = courseLabel(groupData.courseId);
  $('sgt').textContent = groupData.name;

  loadStudentVideos(groupData.courseId, groupId);
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
      getDocs(
        query(
          collection(db, 'videos'),
          where('course', '==', courseId),
          where('group', '==', groupId)
        )
      ),
      getDocs(
        query(
          collection(db, 'videos'),
          where('course', '==', courseId),
          where('group', '==', 'all')
        )
      ),
      getDocs(
        query(
          collection(db, 'videos'),
          where('course', '==', 'all'),
          where('group', '==', 'all')
        )
      )
    ];

    const results = await Promise.all(queries);
    const seenIds = new Set();
    const allDocs = [];

    results.forEach(snapshot => {
      snapshot.forEach(docData => {
        if (!seenIds.has(docData.id)) {
          seenIds.add(docData.id);
          allDocs.push(docData);
        }
      });
    });

    if (!allDocs.length) {
      grid.innerHTML = `
        <div class="empty">
          <div class="ei">📭</div>
          <p>No videos in this group yet.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = '';
    allDocs.forEach((docData, index) => {
      const video = docData.data();
      const card = document.createElement('div');
      card.className = 'vcard';
      card.style.animationDelay = (index * 0.07) + 's';

      const isGoogleDrive = video.type === 'gdrive';

      if (isGoogleDrive) {
        card.innerHTML = `
          <div class="thumb">
            <div class="thumb-gd">
              <div class="thumb-gd-icon">📁</div>
              <div class="thumb-gd-label">Google Drive</div>
            </div>
            <div class="pb pb-gd">▶</div>
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="thumb">
            <img 
              src="https://img.youtube.com/vi/${video.ytId}/mqdefault.jpg" 
              alt="${video.title}" 
              loading="lazy"
            />
            <div class="pb">▶</div>
          </div>
        `;
      }

      card.innerHTML += `
        <div class="vcb">
          <div class="vc-t">${video.title}</div>
          <div class="vc-d">${video.description || ''}</div>
        </div>
      `;

      card.onclick = () => {
        if (isGoogleDrive) {
          openModalDrive(video.driveId, video.title, video.description);
        } else {
          openModalYT(video.ytId, video.title, video.description);
        }
      };

      grid.appendChild(card);
    });
  } catch (error) {
    grid.innerHTML = `<div class="empty"><p>Error: ${error.message}</p></div>`;
  }
}


async function initAdminPanel() {
  populateCourseSelect('vc');
  populateCourseSelect('fc');
  populateCourseSelect('gcourse');
  populateGroupSelect('vg', '', true);
  populateGroupSelect('fg2', '', true);
  await loadStudents();
  renderAddStudentGroups();
  renderStudentGroupFilter();
  window.loadAdminVideos();
}


function populateCourseSelect(elementId, includeAll = true) {
  const select = $(elementId);
  if (!select) return;

  select.innerHTML = '';
  if (includeAll) {
    select.innerHTML = '<option value="all">All Courses</option>';
  }

  Object.entries(COURSES).forEach(([code, name]) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    select.appendChild(option);
  });
}


function populateGroupSelect(elementId, courseFilter = '', includeAll = true) {
  const select = $(elementId);
  if (!select) return;

  select.innerHTML = '';
  if (includeAll) {
    select.innerHTML = '<option value="all">All Groups</option>';
  }

  Object.values(GROUPS)
    .filter(group => {
      if (!courseFilter) return true;
      if (courseFilter === 'all') return true;
      return group.courseId === courseFilter || group.courseId === 'all';
    })
    .forEach(group => {
      const option = document.createElement('option');
      option.value = group.id;
      const courseDisplay = courseFilter === 'all' || !courseFilter
        ? ` (${courseLabel(group.courseId)})`
        : '';
      option.textContent = group.name + courseDisplay;
      select.appendChild(option);
    });
}

window.showAdminTab = tab => {
  ['videos', 'groups', 'students'].forEach(tabName => {
    $(tabName + '-section').style.display = tabName === tab ? 'block' : 'none';
  });

  document.querySelectorAll('.atab').forEach((element, index) => {
    const tabNames = ['videos', 'groups', 'students'];
    element.classList.toggle('on', tabNames[index] === tab);
  });

  if (tab === 'groups') renderGroupsList();
  if (tab === 'students') renderStudentsList();
};


window.switchSource = type => {
  currentSource = type;
  $('stab-yt').classList.toggle('on', type === 'youtube');
  $('stab-gd').classList.toggle('on', type === 'gdrive');
  $('stab-gd').classList.toggle('gdrive', type === 'gdrive');

  $('hint-yt').style.display = type === 'youtube' ? 'block' : 'none';
  $('hint-gd').style.display = type === 'gdrive' ? 'block' : 'none';

  $('vurl-label').textContent = type === 'youtube'
    ? 'YouTube URL or ID'
    : 'Google Drive Link / File ID';

  $('vu').placeholder = type === 'youtube'
    ? 'https://youtube.com/watch?v=...'
    : 'https://drive.google.com/file/d/.../view';
};


window.updateAdminGroups = () => {
  populateGroupSelect('vg', $('vc').value, true);
};


window.filterAdminGroups = () => {
  populateGroupSelect('fg2', $('fc').value, true);
  loadAdminVideos();
};


window.addVideo = async () => {
  const title = $('vt').value.trim();
  const rawUrl = $('vu').value.trim();
  const description = $('vd').value.trim();
  const course = $('vc').value;
  const group = $('vg').value;

  if (!title || !rawUrl) {
    return alert('Enter title and URL.');
  }

  let videoData = {
    title,
    description,
    course,
    group,
    addedAt: new Date().toISOString()
  };

  if (currentSource === 'youtube') {
    const videoId = extractYTId(rawUrl);
    if (!videoId) {
      return alert('Invalid YouTube URL.');
    }
    videoData.type = 'youtube';
    videoData.ytId = videoId;
  } else {
    const fileId = extractDriveId(rawUrl);
    if (!fileId) {
      return alert('Invalid Google Drive link.');
    }
    videoData.type = 'gdrive';
    videoData.driveId = fileId;
  }

  try {
    await addDoc(collection(db, 'videos'), videoData);
    $('vt').value = '';
    $('vu').value = '';
    $('vd').value = '';
    showOk('✅ Video added!');
    loadAdminVideos();
  } catch (error) {
    alert(error.message);
  }
};


window.loadAdminVideos = async () => {
  const course = $('fc').value;
  const group = $('fg2').value;
  const list = $('avl');

  list.innerHTML = '<div style="color:var(--muted);font-size:.82rem">Loading…</div>';

  try {
    const constraints = [where('course', '==', course)];
    if (group && group !== 'all') {
      constraints.push(where('group', '==', group));
    }

    const snapshot = await getDocs(
      query(collection(db, 'videos'), ...constraints)
    );

    if (snapshot.empty) {
      list.innerHTML = '<div style="color:var(--muted);font-size:.82rem">No videos found.</div>';
      return;
    }

    list.innerHTML = '';
    snapshot.forEach(docData => {
      const video = docData.data();
      const isGoogleDrive = video.type === 'gdrive';

      const badge = isGoogleDrive
        ? '<span class="vtype-badge vtype-gd">📁 Drive</span>'
        : '<span class="vtype-badge vtype-yt">▶ YT</span>';

      const item = document.createElement('div');
      item.className = 'vi';
      item.innerHTML = `
        <div class="vi-info">
          <div class="vi-t">${video.title}${badge}</div>
          <div class="vi-m">
            ${isGoogleDrive ? video.driveId : video.ytId} ·
            ${groupLabel(video.group)} ·
            ${courseLabel(video.course)}
          </div>
        </div>
        <button class="bd" onclick="delVideo('${docData.id}')">Delete</button>
      `;
      list.appendChild(item);
    });
  } catch (error) {
    list.innerHTML = `<div style="color:#ff6b6b;font-size:.82rem">${error.message}</div>`;
  }
};


window.delVideo = async id => {
  if (!confirm('Delete this video?')) return;
  await deleteDoc(doc(db, 'videos', id));
  loadAdminVideos();
};


window.createGroup = async () => {
  const name = $('gname').value.trim();
  const courseId = $('gcourse').value;

  if (!name) {
    return alert('Enter group name.');
  }

  await addDoc(collection(db, 'groups'), {
    name,
    courseId,
    createdAt: new Date().toISOString()
  });

  $('gname').value = '';
  await loadGroups();
  populateGroupSelect('vg', $('vc').value, true);
  populateGroupSelect('fg2', '', true);
  renderAddStudentGroups();
  renderStudentGroupFilter();
  renderGroupsList();
  showOk('✅ Group created!');
};


async function renderGroupsList() {
  await loadGroups();
  const container = $('groups-list');
  const groups = Object.values(GROUPS);

  if (!groups.length) {
    container.innerHTML = '<div style="color:var(--muted);padding:2rem;text-align:center">No groups yet.</div>';
    return;
  }

  container.innerHTML = '';
  groups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `
      <div class="gc-header">
        <div class="gc-name">👥 ${group.name}</div>
        <span class="gc-course">${courseLabel(group.courseId)}</span>
      </div>
      <div class="gc-count">ID: ${group.id}</div>
      <button class="gc-del" onclick="deleteGroup('${group.id}')">✕</button>
    `;
    container.appendChild(card);
  });
}


window.deleteGroup = async id => {
  if (!confirm('Delete this group?')) return;
  await deleteDoc(doc(db, 'groups', id));
  await loadGroups();
  populateGroupSelect('vg', $('vc').value, true);
  populateGroupSelect('fg2', '', true);
  renderGroupsList();
};


function buildGroupCheckboxes(containerId, selectedIds = []) {
  const container = $(containerId);
  container.innerHTML = '';

  const groups = Object.values(GROUPS);
  if (!groups.length) {
    container.innerHTML = '<div style="color:var(--muted);font-size:.8rem;padding:.25rem .5rem">No groups yet.</div>';
    return;
  }

  groups.forEach(group => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = group.id;
    checkbox.dataset.group = group.id;

    if (selectedIds.includes(group.id)) {
      checkbox.checked = true;
    }

    label.appendChild(checkbox);
    label.appendChild(
      document.createTextNode(` ${group.name} (${courseLabel(group.courseId)})`)
    );
    container.appendChild(label);
  });
}


function renderAddStudentGroups() {
  buildGroupCheckboxes('add-student-groups');
}


function renderStudentGroupFilter() {
  const select = $('student-group-filter');
  select.innerHTML = '<option value="">All Groups</option>';

  Object.values(GROUPS).forEach(group => {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.name;
    select.appendChild(option);
  });
}


function getCheckedGroups(containerId) {
  return [
    ...$(containerId).querySelectorAll('input[type=checkbox]:checked')
  ].map(checkbox => checkbox.value);
}


window.addStudent = async () => {
  const name = $('sn').value.trim();
  const email = $('se').value.trim().toLowerCase();
  const password = $('sp').value;
  const groups = getCheckedGroups('add-student-groups');

  if (!name || !email || !password) {
    return alert('Fill in all fields.');
  }

  if (password.length < 6) {
    return alert('Password min 6 chars.');
  }

  if (!groups.length) {
    return alert('Select at least one group.');
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      name,
      email,
      groups,
      role: 'student',
      createdAt: new Date().toISOString()
    });

    await loadStudents();
    renderStudentsList();
    $('sn').value = '';
    $('se').value = '';
    $('sp').value = '';
    buildGroupCheckboxes('add-student-groups');
    showOk(`✅ Student "${name}" added!`);
  } catch (error) {
    const errorMessages = {
      'auth/email-already-in-use': 'Email already in use.'
    };
    alert(errorMessages[error.code] || error.message);
  }
};


window.renderStudentsList = () => {
  const searchQuery = $('student-search').value.trim().toLowerCase();
  const groupFilter = $('student-group-filter').value;
  const list = $('students-list');

  let students = [...ALL_STUDENTS];

  if (searchQuery) {
    students = students.filter(student =>
      student.name.toLowerCase().includes(searchQuery) ||
      student.email.toLowerCase().includes(searchQuery)
    );
  }

  if (groupFilter) {
    students = students.filter(student =>
      (student.groups || []).includes(groupFilter)
    );
  }

  if (!students.length) {
    list.innerHTML = '<div style="color:var(--muted);font-size:.82rem;padding:.5rem">No students found.</div>';
    return;
  }

  list.innerHTML = '';
  students.forEach(student => {
    const row = document.createElement('div');
    row.className = 'student-row';

    const badges = (student.groups || [])
      .map(groupId => `<span class="sr-group-badge">${groupLabel(groupId)}</span>`)
      .join('');

    row.innerHTML = `
      <div class="sr-info">
        <div class="sr-name">${student.name}</div>
        <div class="sr-email">${student.email}</div>
        <div class="sr-badges">
          ${badges || '<span style="color:var(--muted);font-size:.72rem">No groups</span>'}
        </div>
      </div>
      <div class="sr-actions">
        <button class="btn-edit" onclick="openEditModal('${student.uid}')">Edit</button>
        <button class="bd" onclick="deleteStudent('${student.uid}','${student.name}')">Delete</button>
      </div>
    `;
    list.appendChild(row);
  });
};


window.openEditModal = uid => {
  const student = ALL_STUDENTS.find(s => s.uid === uid);
  if (!student) return;

  $('edit-uid').value = uid;
  $('edit-name').value = student.name;
  buildGroupCheckboxes('edit-student-groups', student.groups || []);
  $('edit-modal').style.display = 'flex';
};


window.closeEditModal = () => {
  $('edit-modal').style.display = 'none';
};


window.closeEditOut = event => {
  if (event.target.id === 'edit-modal') {
    closeEditModal();
  }
};


window.saveEditStudent = async () => {
  const uid = $('edit-uid').value;
  const name = $('edit-name').value.trim();
  const groups = getCheckedGroups('edit-student-groups');

  if (!name) {
    return alert('Enter student name.');
  }

  if (!groups.length) {
    return alert('Select at least one group.');
  }

  try {
    await updateDoc(doc(db, 'users', uid), { name, groups });

    const studentIndex = ALL_STUDENTS.findIndex(s => s.uid === uid);
    if (studentIndex > -1) {
      ALL_STUDENTS[studentIndex].name = name;
      ALL_STUDENTS[studentIndex].groups = groups;
    }

    renderStudentsList();
    closeEditModal();
    showOk('✅ Student updated!');
  } catch (error) {
    alert(error.message);
  }
};


window.deleteStudent = async (uid, name) => {
  if (!confirm(`Delete student "${name}"? This only removes their data, not their auth account.`)) {
    return;
  }

  await deleteDoc(doc(db, 'users', uid));
  ALL_STUDENTS = ALL_STUDENTS.filter(s => s.uid !== uid);
  renderStudentsList();
};


window.openModalYT = (videoId, title, description) => {
  $('mt').textContent = title;
  $('mif').src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
  $('md').textContent = description || '';
  $('mopen').style.display = 'none';
  $('vmodal').style.display = 'flex';
};


window.openModalDrive = (fileId, title, description) => {
  $('mt').textContent = title;
  $('mif').src = `https://drive.google.com/file/d/${fileId}/preview`;
  $('md').textContent = description || '';
  $('mopen').href = `https://drive.google.com/file/d/${fileId}/view`;
  $('mopen').style.display = 'flex';
  $('vmodal').style.display = 'flex';
};

window.closeModal = () => {
  $('vmodal').style.display = 'none';
  $('mif').src = '';
};


window.closeOut = event => {
  if (event.target.id === 'vmodal') {
    closeModal();
  }
};


function extractYTId(input) {
  input = input.trim();

  const patterns = [
    /(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}


function extractDriveId(input) {
  input = input.trim();


  const match1 = input.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (match1) {
    return match1[1];
  }

  
  const match2 = input.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (match2) {
    return match2[1];
  }

 
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) {
    return input;
  }

  return null;
}
