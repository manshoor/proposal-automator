-- Settings table (single row, like profiles)
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  locations TEXT[] DEFAULT '{"United Kingdom","United States","Canada","Singapore","Malaysia","United Arab Emirates","Abu Dhabi","Dubai","Saudi Arabia","Qatar","Bahrain"}',
  min_spent INTEGER DEFAULT 1000,
  min_hire_rate INTEGER DEFAULT 30,
  min_reviews INTEGER DEFAULT 3,
  notification_enabled BOOLEAN DEFAULT FALSE,
  notification_interval INTEGER DEFAULT 5,
  budget_min DECIMAL(10,2) DEFAULT NULL,
  budget_max DECIMAL(10,2) DEFAULT NULL,
  skills_include TEXT[] DEFAULT '{}',
  keywords_include TEXT[] DEFAULT '{}',
  keywords_exclude TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
