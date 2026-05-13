const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const formidable = require('formidable');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const sessions = new Map();

const roles = {
  ADMIN: ['all'],
  COMMANDANT: ['read', 'validate', 'reports', 'rotations'],
  RESPONSABLE_UNITE: ['read', 'attendance', 'rotations'],
  CONSULTATION: ['read']
};

const now = () => new Date().toISOString();

const uid = (prefix) => {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
};

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
};

const verifyPassword = (password, stored) => {
  const [salt, hash] = String(stored || '').split(':');

  if (!salt || !hash) {
    return false;
  }

  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

function seed() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    return;
  }

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
    id: uid('agt'),
    matricule: r[0],
    lastName: r[1],
    firstName: r[2],
    grade: r[3],
    function: r[4],
    unit: r[5],
    status: r[6],
    position: r[7],
    integrationDate: `202${i % 4}-0${(i % 8) + 1}-15`,
    email: `${r[2].toLowerCase()}.${r[1].toLowerCase()}@dsp.local`,
    phone: '',
    notes: 'Dossier initial.',
    archived: false,
    assignmentHistory: [
      {
        date: '2025-01-01',
        unit: r[5],
        function: r[4],
        author: 'Systeme'
      }
    ],
    createdAt: now(),
    updatedAt: now()
  }));

  save({
    users: [
      {
        id: uid('usr'),
        firstName: 'Admin',
        lastName: 'DSP',
        email: 'admin@dsp.local',
        passwordHash: hashPassword('Admin@123'),
        role: 'ADMIN',
        active: true,
        emailConfirmed: true,
        createdAt: now()
      }
    ],
    agents,
    attendance: [],
    rotations: [
      {
        id: uid('rot'),
        weekStart: '2026-05-11',
        team: 'Alpha',
        unit: 'Unite Alpha',
        day: 'Lundi',
        shift: '07:00-15:00',
        agentMatricules: ['DSP-0002', 'DSP-0003'],
        status: 'Planifie',
        updatedAt: now()
      }
    ],
    documents: [
      {
        id: uid('doc'),
        agentMatricule: 'DSP-0003',
        title: 'Justificatif absence',
        type: 'Certificat medical',
        expiryDate: '2026-06-15',
        version: 1,
        author: 'Admin DSP',
        createdAt: now(),
        archived: false
      }
    ],
    alerts: [],
    auditLog: [],
    securityLog: []
  });
}

function db() {
  seed();
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function safeUser(user) {
  if (!user) {
    return null;
  }

  const { passwordHash, ...safe } = user;
  return safe;
}

function can(user, permission) {
  const userRoles = roles[user?.role] || [];
  return userRoles.includes('all') || userRoles.includes(permission);
}

function audit(data, user, action, entity, beforeValue = '', afterValue = '', reason = '') {
  data.auditLog.unshift({
    id: uid('aud'),
    date: now(),
    author: user ? `${user.firstName} ${user.lastName}` : 'Systeme',
    action,
    entity,
    beforeValue,
    afterValue,
    reason
  });
}

function security(data, user, action, status, details = '') {
  data.securityLog.unshift({
    id: uid('sec'),
    date: now(),
    userEmail: user?.email || '',
    action,
    status,
    details
  });
}

function alerts(data) {
  const list = [];
  const byUnit = {};

  data.agents
    .filter(agent => !agent.archived)
    .forEach(agent => {
      byUnit[agent.unit] ||= { total: 0, present: 0 };

      if (agent.status === 'Actif') {
        byUnit[agent.unit].total++;
      }

      if (agent.status === 'Actif' && agent.position === 'Present') {
        byUnit[agent.unit].present++;
      }

      if (agent.position === 'Absence injustifiee') {
        list.push({
          id: `abs-${agent.id}`,
          type: 'Absence non justifiee',
          agentMatricule: agent.matricule,
          unit: agent.unit,
          detectedAt: now(),
          urgency: 'Haute',
          status: 'Ouverte'
        });
      }
    });

  Object.entries(byUnit).forEach(([unit, value]) => {
    if (value.total && value.present / value.total < 0.55) {
      list.push({
        id: `staff-${unit}`,
        type: 'Sous-effectif',
        agentMatricule: '',
        unit,
        detectedAt: now(),
        urgency: 'Critique',
        status: 'Ouverte'
      });
    }
  });

  data.documents
    .filter(document => !document.archived && document.expiryDate)
    .forEach(document => {
      const daysLeft = (new Date(document.expiryDate) - new Date()) / 86400000;

      if (daysLeft <= 30) {
        list.push({
          id: `doc-${document.id}`,
          type: 'Document a renouveler',
          agentMatricule: document.agentMatricule,
          unit: '',
          detectedAt: now(),
          urgency: 'Moyenne',
          status: 'Ouverte'
        });
      }
    });

  data.alerts = list;
  return list;
}

function stats(data) {
  const agents = data.agents.filter(agent => !agent.archived);

  const count = (key, value) => {
    return agents.filter(agent => agent[key] === value).length;
  };

  const group = (key) => {
    return agents.reduce((acc, agent) => {
      acc[agent[key]] = (acc[agent[key]] || 0) + 1;
      return acc;
    }, {});
  };

  return {
    total: agents.length,
    active: count('status', 'Actif'),
    inactive: count('status', 'Inactif'),
    present: count('position', 'Present'),
    justified: count('position', 'Absence justifiee'),
    unjustified: count('position', 'Absence injustifiee'),
    sick: count('position', 'Maladie'),
    byUnit: group('unit'),
    byGrade: group('grade')
  };
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', chunk => {
      raw += chunk;

      if (raw.length > 1_000_000) {
        req.destroy();
        reject(new Error('Payload trop volumineux.'));
      }
    });

    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error('JSON invalide.'));
      }
    });

    req.on('error', reject);
  });
}

function send(res, code, payload) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });

  res.end(JSON.stringify(payload));
}

function session(req) {
  const match = String(req.headers.cookie || '').match(/dsp_session=([^;]+)/);
  return match ? sessions.get(match[1]) : null;
}

function currentUser(req, data) {
  const currentSession = session(req);

  if (!currentSession || currentSession.exp <= Date.now()) {
    return null;
  }

  return data.users.find(user => user.id === currentSession.userId && user.active);
}

async function api(req, res) {
  const data = db();
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const input = await body(req);

      const user = data.users.find(
        item => item.email.toLowerCase() === String(input.email || '').toLowerCase()
      );

      if (!user || !verifyPassword(input.password || '', user.passwordHash)) {
        security(data, user, 'Connexion', 'Echec');
        save(data);
        return send(res, 401, { error: 'Adresse e-mail ou mot de passe incorrect.' });
      }

      if (!user.active || !user.emailConfirmed) {
        return send(res, 403, { error: 'Compte inactif ou e-mail non confirmee.' });
      }

      const token = crypto.randomBytes(32).toString('hex');

      sessions.set(token, {
        userId: user.id,
        exp: Date.now() + 28800000
      });

      security(data, user, 'Connexion', 'Succes');
      save(data);

      res.setHeader(
        'Set-Cookie',
        `dsp_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
      );

      return send(res, 200, {
        user: safeUser(user)
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      res.setHeader('Set-Cookie', 'dsp_session=; Path=/; Max-Age=0');
      return send(res, 200, { ok: true });
    }

    const user = currentUser(req, data);

    if (!user) {
      return send(res, 401, { error: 'Session expiree.' });
    }

    if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
      alerts(data);
      save(data);

      return send(res, 200, {
        user: safeUser(user),
        stats: stats(data),
        agents: data.agents,
        attendance: data.attendance,
        rotations: data.rotations,
        documents: data.documents,
        alerts: data.alerts,
        users: data.users.map(safeUser),
        auditLog: data.auditLog,
        securityLog: data.securityLog
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/agents') {
      if (!can(user, 'all')) {
        return send(res, 403, { error: 'Droit administrateur requis.' });
      }

      const input = await body(req);

      if (!input.matricule) {
        return send(res, 400, { error: 'Matricule policier obligatoire.' });
      }

      if (data.agents.some(agent => agent.matricule === input.matricule)) {
        return send(res, 400, { error: 'Ce matricule policier existe deja.' });
      }

      const agent = {
        id: uid('agt'),
        ...input,
        archived: false,
        assignmentHistory: [],
        createdAt: now(),
        updatedAt: now()
      };

      data.agents.unshift(agent);
      audit(data, user, 'Creation agent', agent.matricule);
      save(data);

      return send(res, 201, { agent });
    }

    if (req.method === 'PUT' && url.pathname.startsWith('/api/agents/')) {
      if (!can(user, 'all')) {
        return send(res, 403, { error: 'Droit administrateur requis.' });
      }

      const id = url.pathname.split('/').pop();
      const index = data.agents.findIndex(agent => agent.id === id);

      if (index < 0) {
        return send(res, 404, { error: 'Agent introuvable.' });
      }

      const input = await body(req);
      const before = { ...data.agents[index] };

      delete input.matricule;

      data.agents[index] = {
        ...data.agents[index],
        ...input,
        updatedAt: now()
      };

      audit(data, user, 'Modification agent', before.matricule, before, data.agents[index]);
      save(data);

      return send(res, 200, { agent: data.agents[index] });
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/agents/')) {
      if (!can(user, 'all')) {
        return send(res, 403, { error: 'Droit administrateur requis.' });
      }

      const id = url.pathname.split('/').pop();
      const agent = data.agents.find(item => item.id === id);

      if (!agent) {
        return send(res, 404, { error: 'Agent introuvable.' });
      }

      agent.archived = true;
      agent.status = 'Inactif';
      agent.updatedAt = now();

      audit(data, user, 'Archivage agent', agent.matricule);
      save(data);

      return send(res, 200, { agent });
    }

    if (req.method === 'POST' && url.pathname === '/api/attendance') {
      if (!can(user, 'all') && !can(user, 'attendance')) {
        return send(res, 403, { error: 'Droit fiche d’appel requis.' });
      }

      const sheet = await body(req);

      sheet.id ||= uid('att');
      sheet.author = `${user.firstName} ${user.lastName}`;
      sheet.updatedAt = now();

      data.attendance.unshift(sheet);

      if (Array.isArray(sheet.entries)) {
        sheet.entries.forEach(entry => {
          const agent = data.agents.find(item => item.matricule === entry.matricule);

          if (agent) {
            agent.position = entry.position;
            agent.updatedAt = now();
          }
        });
      }

      audit(data, user, "Fiche d'appel", sheet.date);
      save(data);

      return send(res, 200, { sheet });
    }

    if (req.method === 'POST' && url.pathname === '/api/rotations') {
      if (!can(user, 'all') && !can(user, 'rotations')) {
        return send(res, 403, { error: 'Droit rotations requis.' });
      }

      const rotation = {
        id: uid('rot'),
        ...(await body(req)),
        updatedAt: now()
      };

      data.rotations.unshift(rotation);
      audit(data, user, 'Rotation', rotation.team);
      save(data);

      return send(res, 200, { rotation });
    }

   if (req.method === 'POST' && url.pathname === '/api/documents') {

  if (!can(user, 'all')) {
    return send(res, 403, { error: 'Droit administrateur requis.' });
  }

  const form = formidable({
    multiples: false,
    uploadDir: UPLOADS_DIR,
    keepExtensions: true
  });

  return form.parse(req, (err, fields, files) => {

    if (err) {
      return send(res, 500, {
        error: 'Erreur upload document.'
      });
    }

    const uploadedFile = files.file;

    if (!uploadedFile) {
      return send(res, 400, {
        error: 'Aucun fichier envoyé.'
      });
    }

    const file = Array.isArray(uploadedFile)
      ? uploadedFile[0]
      : uploadedFile;

    const document = {
      id: uid('doc'),

      agentMatricule:
        fields.agentMatricule?.[0] || '',

      title:
        fields.title?.[0] || '',

      type:
        fields.type?.[0] || '',

      expiryDate:
        fields.expiryDate?.[0] || '',

      version:
        Number(fields.version?.[0] || 1),

      author:
        `${user.firstName} ${user.lastName}`,

      createdAt: now(),

      archived: false,

      fileName: file.originalFilename,

      fileUrl:
        '/uploads/' + path.basename(file.filepath)
    };

    data.documents.unshift(document);

    audit(
      data,
      user,
      'Document',
      document.title
    );

    save(data);

    return send(res, 200, { document });

  });
}

    if (req.method === 'POST' && url.pathname === '/api/users') {
      if (!can(user, 'all')) {
        return send(res, 403, { error: 'Droit administrateur requis.' });
      }

      const input = await body(req);

      if (!input.firstName || !input.lastName || !input.email || !input.password) {
        return send(res, 400, {
          error: 'Nom, prenom, e-mail et mot de passe sont obligatoires.'
        });
      }

      if (data.users.some(item => item.email.toLowerCase() === String(input.email).toLowerCase())) {
        return send(res, 400, {
          error: 'Cette adresse e-mail est deja utilisee.'
        });
      }

      const newUser = {
        id: uid('usr'),
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        passwordHash: hashPassword(input.password),
        role: input.role || 'CONSULTATION',
        active: true,
        emailConfirmed: !!input.emailConfirmed,
        createdAt: now()
      };

      data.users.unshift(newUser);

      security(data, newUser, 'Creation compte', 'Succes');
      audit(data, user, 'Creation utilisateur', newUser.email);
      save(data);

      return send(res, 201, {
        user: safeUser(newUser)
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/export') {
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename=dsp-export.csv'
      });

      return res.end(
        data.agents
          .filter(agent => !agent.archived)
          .map(agent => [
            agent.matricule,
            agent.lastName,
            agent.firstName,
            agent.grade,
            agent.unit,
            agent.status,
            agent.position
          ].join(';'))
          .join('\n')
      );
    }

    return send(res, 404, {
      error: 'Route introuvable.'
    });
  } catch (error) {
    return send(res, 500, {
      error: error.message
    });
  }
}

function staticFile(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = requestUrl.pathname === '/'
    ? 'index.html'
    : decodeURIComponent(requestUrl.pathname);

  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      res.writeHead(404);
      return res.end('Not found');
    }

    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml'
    };

    const type = contentTypes[path.extname(filePath)] || 'application/octet-stream';

    res.writeHead(200, {
      'content-type': type
    });

    return res.end(buffer);
  });
}

http
  .createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      return api(req, res);
    }

    return staticFile(req, res);
  })
  .listen(PORT, () => {
    seed();
    console.log(`DSP running on http://localhost:${PORT}`);
  });
