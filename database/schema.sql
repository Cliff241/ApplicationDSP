CREATE TABLE roles (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(120) NOT NULL
);

CREATE TABLE users (
  id UUID PRIMARY KEY,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role_code VARCHAR(50) NOT NULL REFERENCES roles(code),
  active BOOLEAN NOT NULL DEFAULT true,
  email_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE units (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  parent_id BIGINT REFERENCES units(id)
);

CREATE TABLE grades (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  rank_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE agents (
  id UUID PRIMARY KEY,
  matricule_policier VARCHAR(50) NOT NULL UNIQUE,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  grade VARCHAR(120) NOT NULL,
  function_name VARCHAR(160) NOT NULL,
  unit_name VARCHAR(150) NOT NULL,
  status VARCHAR(30) NOT NULL CHECK (status IN ('Actif', 'Inactif')),
  current_position VARCHAR(50) NOT NULL CHECK (current_position IN ('Present', 'Absence justifiee', 'Absence injustifiee', 'Maladie')),
  integration_date DATE NOT NULL,
  professional_email VARCHAR(255),
  phone VARCHAR(60),
  notes TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_matricule ON agents(matricule_policier);
CREATE INDEX idx_agents_search ON agents(last_name, first_name, grade, unit_name, status, current_position);

CREATE TABLE assignments_history (
  id UUID PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agents(id),
  old_unit VARCHAR(150),
  new_unit VARCHAR(150) NOT NULL,
  old_function VARCHAR(160),
  new_function VARCHAR(160) NOT NULL,
  changed_by UUID REFERENCES users(id),
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attendance_sheets (
  id UUID PRIMARY KEY,
  call_date DATE NOT NULL,
  unit_name VARCHAR(150) NOT NULL,
  status VARCHAR(30) NOT NULL CHECK (status IN ('Brouillon', 'Validee')),
  author_id UUID REFERENCES users(id),
  validator_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(call_date, unit_name)
);

CREATE TABLE attendance_entries (
  id UUID PRIMARY KEY,
  sheet_id UUID NOT NULL REFERENCES attendance_sheets(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id),
  position VARCHAR(50) NOT NULL CHECK (position IN ('Present', 'Absence justifiee', 'Absence injustifiee', 'Maladie')),
  reason TEXT
);

CREATE TABLE rotations (
  id UUID PRIMARY KEY,
  week_start DATE NOT NULL,
  day_name VARCHAR(20) NOT NULL,
  team VARCHAR(120) NOT NULL,
  unit_name VARCHAR(150) NOT NULL,
  shift_label VARCHAR(60) NOT NULL,
  status VARCHAR(50) NOT NULL,
  author_id UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rotation_agents (
  rotation_id UUID NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id),
  PRIMARY KEY(rotation_id, agent_id)
);

CREATE TABLE documents (
  id UUID PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agents(id),
  title VARCHAR(255) NOT NULL,
  document_type VARCHAR(120) NOT NULL,
  storage_path TEXT,
  expiry_date DATE,
  version INTEGER NOT NULL DEFAULT 1,
  archived BOOLEAN NOT NULL DEFAULT false,
  author_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id UUID PRIMARY KEY,
  alert_type VARCHAR(150) NOT NULL,
  agent_id UUID REFERENCES agents(id),
  unit_name VARCHAR(150),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  urgency VARCHAR(30) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Ouverte'
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  author_id UUID REFERENCES users(id),
  action VARCHAR(150) NOT NULL,
  entity VARCHAR(150) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT
);

CREATE TABLE security_log (
  id UUID PRIMARY KEY,
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES users(id),
  user_email VARCHAR(255),
  action VARCHAR(150) NOT NULL,
  status VARCHAR(50) NOT NULL,
  details TEXT
);
