const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const sessions = new Map();

const roles = {
  ADMIN: ['all'],
  COMMANDANT: ['read', 'validate', 'reports', 'rotations'],
  RESPONSABLE_UNITE: ['read', 'attendance', 'rotations'],
  CONSULTATION: ['read']
};

const now = () => new Date().toISOString();
const uid = (p) => `${p}_${crypto.randomBytes(8).toString('hex')}`;
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
const verifyPassword = (password, stored) => {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

function seed() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) return;
  const rows = [
    ['DSP-0001', 'Uchiha', 'Itachi', 'Commandant', "Chef d'unite", 'Compagnie Centrale', 'Actif', 'Present'],
    ['DSP-0002', 'Ndiaye', 'Moussa', 'Lieutenant', 'Responsable secteur', 'Unite Alpha', 'Actif', 'Present'],
    ['DSP-0003', 'Diop', 'Awa', 'Sergent', "Chef d'equipe", 'Unite Alpha', 'Actif', 'Absence justifiee'],
    ['DSP-0004', 'Kone', 'Yacouba', 'Brigadier', 'Agent operationnel', 'Unite Bravo', 'Actif', 'Maladie'],
    ['DSP-0005', 'Mensah', 'Esi', 'Inspecteur', 'Agent documentaire', 'Administration', 'Actif', 'Present'],
    ['DSP-0006', 'Traore', 'Ibrahim', 'Agent', 'Patrouille', 'Unite Bravo', 'Actif', 'Absence injustifiee'],
    ['DSP-0007', 'Camara', 'Fatou', 'Capitaine', 'Commandant compagnie', 'Compagnie Nord', 'Actif', 'Present']
  ];
  const agents = rows.map((r, i) => ({
    id: uid('agt'), matricule: r[0], lastName: r[1], firstName: r[2], grade: r[3], function: r[4], unit: r[5], status: r[6], position: r[7],
    integrationDate: `202${i % 4}-0${(i % 8) + 1}-15`, email: `${r[2].toLowerCase()}.${r[1].toLowerCase()}@dsp.local`, phone: '', notes: 'Dossier initial.', archived: false,
    assignmentHistory: [{ date: '2025-01-01', unit: r[5], function: r[4], author: 'Systeme' }], createdAt: now(), updatedAt: now()
  }));
  save({
    users: [{ id: uid('usr'), firstName: 'Admin', lastName: 'DSP', email: 'admin@dsp.local', passwordHash: hashPassword('Admin@123'), role: 'ADMIN', active: true, emailConfirmed: true, createdAt: now() }],
    agents,
    attendance: [],
    rotations: [{ id: uid('rot'), weekStart: '2026-05-11', team: 'Alpha', unit: 'Unite Alpha', day: 'Lundi', shift: '07:00-15:00', agentMatricules: ['DSP-0002', 'DSP-0003'], status: 'Planifie', updatedAt: now() }],
    documents: [{ id: uid('doc'), agentMatricule: 'DSP-0003', title: 'Justificatif absence', type: 'Certificat medical', expiryDate: '2026-06-15', version: 1, author: 'Admin DSP', createdAt: now(), archived: false }],
    alerts: [], auditLog: [], securityLog: []
  });
}
function db() { seed(); return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function save(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
function safeUser(u) { const { passwordHash, ...safe } = u; return safe; }
function can(user, perm) { const r = roles[user?.role] || []; return r.includes('all') || r.includes(perm); }
function audit(data, user, action, entity, beforeValue = '', afterValue = '', reason = '') { data.auditLog.unshift({ id: uid('aud'), date: now(), author: user ? `${user.firstName} ${user.lastName}` : 'Systeme', action, entity, beforeValue, afterValue, reason }); }
function security(data, user, action, status, details = '') { data.securityLog.unshift({ id: uid('sec'), date: now(), userEmail: user?.email || '', action, status, details }); }

function alerts(data) {
  const list = [];
  const byUnit = {};
  data.agents.filter(a => !a.archived).forEach(a => {
    byUnit[a.unit] ||= { total: 0, present: 0 };
    if (a.status === 'Actif') byUnit[a.unit].total++;
    if (a.status === 'Actif' && a.position === 'Present') byUnit[a.unit].present++;
    if (a.position === 'Absence injustifiee') list.push({ id: `abs-${a.id}`, type: 'Absence non justifiee', agentMatricule: a.matricule, unit: a.unit, detectedAt: now(), urgency: 'Haute', status: 'Ouverte' });
  });
  Object.entries(byUnit).forEach(([unit, v]) => { if (v.total && v.present / v.total < 0.55) list.push({ id: `staff-${unit}`, type: 'Sous-effectif', agentMatricule: '', unit, detectedAt: now(), urgency: 'Critique', status: 'Ouverte' }); });
  data.documents.filter(d => !d.archived && d.expiryDate).forEach(d => { if ((new Date(d.expiryDate) - new Date()) / 86400000 <= 30) list.push({ id: `doc-${d.id}`, type: 'Document a renouveler', agentMatricule: d.agentMatricule, unit: '', detectedAt: now(), urgency: 'Moyenne', status: 'Ouverte' }); });
  data.alerts = list; return list;
}
function stats(data) {
  const agents = data.agents.filter(a => !a.archived);
  const count = (k, v) => agents.filter(a => a[k] === v).length;
  const group = (k) => agents.reduce((m, a) => (m[a[k]] = (m[a[k]] || 0) + 1, m), {});
  return { total: agents.length, active: count('status', 'Actif'), inactive: count('status', 'Inactif'), present: count('position', 'Present'), justified: count('position', 'Absence justifiee'), unjustified: count('position', 'Absence injustifiee'), sick: count('position', 'Maladie'), byUnit: group('unit'), byGrade: group('grade') };
}
function body(req) { return new Promise((ok, ko) => { let s = ''; req.on('data', c => s += c); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { ko(e); } }); }); }
function send(res, code, payload) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(payload)); }
function session(req) { const m = String(req.headers.cookie || '').match(/dsp_session=([^;]+)/); return m && sessions.get(m[1]); }
function currentUser(req, data) { const s = session(req); return s && s.exp > Date.now() ? data.users.find(u => u.id === s.userId && u.active) : null; }

async function api(req, res) {
  const data = db();
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const input = await body(req);
      const user = data.users.find(u => u.email.toLowerCase() === String(input.email || '').toLowerCase());
      if (!user || !verifyPassword(input.password || '', user.passwordHash)) { security(data, user, 'Connexion', 'Echec'); save(data); return send(res, 401, { error: 'Adresse e-mail ou mot de passe incorrect.' }); }
      if (!user.active || !user.emailConfirmed) return send(res, 403, { error: 'Compte inactif ou e-mail non confirmee.' });
      const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { userId: user.id, exp: Date.now() + 28800000 }); security(data, user, 'Connexion', 'Succes'); save(data);
      res.setHeader('Set-Cookie', `dsp_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`); return send(res, 200, { user: safeUser(user) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') { res.setHeader('Set-Cookie', 'dsp_session=; Path=/; Max-Age=0'); return send(res, 200, { ok: true }); }
    const user = currentUser(req, data); if (!user) return send(res, 401, { error: 'Session expiree.' });
    if (req.method === 'GET' && url.pathname === '/api/bootstrap') { alerts(data); save(data); return send(res, 200, { user: safeUser(user), stats: stats(data), agents: data.agents, attendance: data.attendance, rotations: data.rotations, documents: data.documents, alerts: data.alerts, users: data.users.map(safeUser), auditLog: data.auditLog, securityLog: data.securityLog }); }
    if (req.method === 'POST' && url.pathname === '/api/agents') { if (!can(user, 'all')) return send(res, 403, { error: 'Droit administrateur requis.' }); const x = await body(req); if (!x.matricule || data.agents.some(a => a.matricule === x.matricule)) return send(res, 400, { error: 'Matricule obligatoire et unique.' }); const a = { id: uid('agt'), ...x, archived: false, assignmentHistory: [], createdAt: now(), updatedAt: now() }; data.agents.unshift(a); audit(data, user, 'Creation agent', a.matricule); save(data); return send(res, 201, { agent: a }); }
    if (req.method === 'PUT' && url.pathname.startsWith('/api/agents/')) { const id = url.pathname.split('/').pop(); const i = data.agents.findIndex(a => a.id === id); if (i < 0) return send(res, 404, { error: 'Agent introuvable.' }); const x = await body(req); const old = data.agents[i]; data.agents[i] = { ...old, ...x, updatedAt: now() }; audit(data, user, 'Modification agent', old.matricule, old, data.agents[i]); save(data); return send(res, 200, { agent: data.agents[i] }); }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/agents/')) { const id = url.pathname.split('/').pop(); const a = data.agents.find(x => x.id === id); if (!a) return send(res, 404, { error: 'Agent introuvable.' }); a.archived = true; a.status = 'Inactif'; audit(data, user, 'Archivage agent', a.matricule); save(data); return send(res, 200, { agent: a }); }
    if (req.method === 'POST' && url.pathname === '/api/attendance') { const s = await body(req); s.id ||= uid('att'); s.author = `${user.firstName} ${user.lastName}`; s.updatedAt = now(); data.attendance.unshift(s); s.entries.forEach(e => { const a = data.agents.find(x => x.matricule === e.matricule); if (a) a.position = e.position; }); audit(data, user, "Fiche d'appel", s.date); save(data); return send(res, 200, { sheet: s }); }
    if (req.method === 'POST' && url.pathname === '/api/rotations') { const r = { id: uid('rot'), ...(await body(req)), updatedAt: now() }; data.rotations.unshift(r); audit(data, user, 'Rotation', r.team); save(data); return send(res, 200, { rotation: r }); }
    if (req.method === 'POST' && url.pathname === '/api/documents') { const d = { id: uid('doc'), ...(await body(req)), author: `${user.firstName} ${user.lastName}`, createdAt: now(), archived: false }; data.documents.unshift(d); audit(data, user, 'Document', d.title); save(data); return send(res, 200, { document: d }); }
    if (req.method === 'POST' && url.pathname === '/api/users') { const x = await body(req); const u = { id: uid('usr'), firstName: x.firstName, lastName: x.lastName, email: x.email, passwordHash: hashPassword(x.password), role: x.role || 'CONSULTATION', active: true, emailConfirmed: !!x.emailConfirmed, createdAt: now() }; data.users.unshift(u); security(data, u, 'Creation compte', 'Succes'); save(data); return send(res, 201, { user: safeUser(u) }); }
    if (req.method === 'GET' && url.pathname === '/api/export') { res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename=dsp-export.csv' }); return res.end(data.agents.map(a => [a.matricule, a.lastName, a.firstName, a.grade, a.unit, a.status, a.position].join(';')).join('\n')); }
    send(res, 404, { error: 'Route introuvable.' });
  } catch (e) { send(res, 500, { error: e.message }); }
}
function staticFile(req, res) { const p = path.normalize(path.join(PUBLIC_DIR, new URL(req.url, `http://${req.headers.host}`).pathname === '/' ? 'index.html' : decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname))); if (!p.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); } fs.readFile(p, (e, b) => { if (e) { res.writeHead(404); return res.end('Not found'); } const t = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' }[path.extname(p)] || 'application/octet-stream'; res.writeHead(200, { 'content-type': t }); res.end(b); }); }
http.createServer((req, res) => req.url.startsWith('/api/') ? api(req, res) : staticFile(req, res)).listen(PORT, () => { seed(); console.log(`DSP running on http://localhost:${PORT}`); });
