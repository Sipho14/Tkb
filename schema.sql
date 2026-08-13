-- Scholar Transit: core schema
-- Multi-business: any number of transport operators can self-register and run their own
-- isolated fleet, students, and billing under one deployment.

CREATE TABLE IF NOT EXISTS business (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_email TEXT UNIQUE NOT NULL,
  owner_password_hash TEXT NOT NULL,
  contact_name TEXT,
  contact_surname TEXT,
  contact_phone TEXT,
  company_name TEXT,
  company_address TEXT,
  whatsapp_display_number TEXT,
  trial_started_at TEXT NOT NULL,
  trial_days INTEGER NOT NULL DEFAULT 30,
  subscription_status TEXT NOT NULL DEFAULT 'trial', -- trial | active | past_due | canceled
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_tier TEXT NOT NULL DEFAULT 'starter', -- starter | growth | established | fleet
  student_limit INTEGER NOT NULL DEFAULT 20,
  price_cents INTEGER NOT NULL DEFAULT 85000, -- ZAR, in cents
  email_verified INTEGER NOT NULL DEFAULT 0,
  verification_code TEXT,
  verification_expires TEXT,
  service_area TEXT, -- free text description of the area(s) the business covers
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES business(id),
  unique_id TEXT UNIQUE,
  whatsapp_number TEXT NOT NULL,
  name TEXT,
  home_address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER NOT NULL REFERENCES parents(id),
  name TEXT NOT NULL,
  age INTEGER,
  grade TEXT,
  school TEXT,
  school_address TEXT,
  pickup_address TEXT,
  dropoff_address TEXT,
  dropoff_time TEXT, -- compulsory: scheduled school drop-off time, e.g. '07:45'
  allergies TEXT,
  medical_conditions TEXT,
  medication TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  monthly_payment_cents INTEGER,
  payment_due_day INTEGER, -- day of month, 1-31
  payment_method TEXT, -- 'eft' | 'card' | 'cash' | 'debit_order'
  route_id INTEGER REFERENCES routes(id),
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES business(id),
  name TEXT NOT NULL,
  phone TEXT,
  license_number TEXT,
  vehicle_id INTEGER REFERENCES vehicles(id),
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES business(id),
  plate_number TEXT NOT NULL,
  model TEXT,
  capacity INTEGER,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES business(id),
  name TEXT NOT NULL,
  description TEXT,
  driver_id INTEGER REFERENCES drivers(id),
  morning_time TEXT,
  afternoon_time TEXT,
  delay_alert_threshold_minutes INTEGER NOT NULL DEFAULT 5,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL REFERENCES routes(id),
  service_date TEXT NOT NULL,
  leg TEXT NOT NULL CHECK (leg IN ('morning','afternoon')),
  status TEXT NOT NULL DEFAULT 'scheduled',
  started_at TEXT,
  completed_at TEXT,
  current_lat REAL,
  current_lng REAL,
  eta_minutes INTEGER,
  driver_access_token TEXT UNIQUE,
  cumulative_delay_minutes INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  status TEXT NOT NULL DEFAULT 'booked',
  booked_via TEXT DEFAULT 'whatsapp',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  sequence INTEGER NOT NULL,
  scheduled_offset_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  delay_reason TEXT,
  eta_at TEXT,
  arrived_at TEXT,
  picked_up_at TEXT,
  parent_notified_for_delay INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER NOT NULL REFERENCES parents(id),
  student_id INTEGER REFERENCES students(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'zar',
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_checkout_session_id TEXT,
  period_label TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES parents(id),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  body TEXT,
  ai_action TEXT,
  needs_human INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES business(id),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  related_trip_id INTEGER,
  resolved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trip_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  diagnosis TEXT NOT NULL,
  suggestions TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Business documents: T&Cs, contracts, service-area descriptions, profile files.
-- Stored inline as base64 — fine for the PDFs/docs a small operator needs; swap for
-- object storage (S3-style) later if file sizes grow.
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES business(id),
  category TEXT NOT NULL, -- 'profile' | 'service_area' | 'terms' | 'contract' | 'other'
  title TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  file_data TEXT, -- base64, nullable if this is a text-only record (e.g. typed-out T&Cs)
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Full HR record for everyone who works for the business, not just drivers.
-- Drivers get an additional linked row in `drivers` (driver_record_id) so the
-- existing routes/trips/logistics system keeps working unchanged.
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES business(id),
  first_name TEXT NOT NULL,
  surname TEXT NOT NULL,
  id_number TEXT,
  license_code TEXT, -- driver's license code, e.g. 'Code 10' — relevant for drivers
  street_address TEXT,
  suburb TEXT,
  city TEXT,
  postal_code TEXT,
  department TEXT NOT NULL DEFAULT 'other', -- driver | cleaner | reception | admin | mechanic | other
  phone TEXT,
  email TEXT,
  start_date TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | inactive
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  assigned_vehicle_id INTEGER REFERENCES vehicles(id),
  driver_record_id INTEGER REFERENCES drivers(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_students_parent ON students(parent_id);
CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(service_date);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_stops_trip ON stops(trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stops_trip_student ON stops(trip_id, student_id);
CREATE INDEX IF NOT EXISTS idx_parents_business ON parents(business_id);
CREATE INDEX IF NOT EXISTS idx_parents_whatsapp ON parents(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_drivers_business ON drivers(business_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_business ON vehicles(business_id);
CREATE INDEX IF NOT EXISTS idx_routes_business ON routes(business_id);
CREATE INDEX IF NOT EXISTS idx_alerts_business ON alerts(business_id);
CREATE INDEX IF NOT EXISTS idx_documents_business ON documents(business_id);
CREATE INDEX IF NOT EXISTS idx_staff_business ON staff(business_id);
