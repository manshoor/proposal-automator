-- Projects/portfolio table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url VARCHAR(500) DEFAULT NULL,
  technologies TEXT[] DEFAULT '{}',
  category VARCHAR(100) DEFAULT '',
  client_name VARCHAR(255) DEFAULT '',
  budget_range VARCHAR(100) DEFAULT '',
  duration VARCHAR(100) DEFAULT '',
  outcome TEXT DEFAULT '',
  is_featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
CREATE INDEX IF NOT EXISTS idx_projects_featured ON projects(is_featured);
