import 'dotenv/config';
import { db, getBusinessByEmail } from './db.js';
import { hashForStorage } from './auth.js';

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL || 'owner@example.com';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD || 'changeme123';
const BUSINESS_NAME = process.env.SEED_BUSINESS_NAME || 'Sunrise Scholar Transit';

let business = getBusinessByEmail(OWNER_EMAIL);
if (!business) {
  const result = db.prepare(`
    INSERT INTO business (name, owner_email, owner_password_hash, trial_started_at, trial_days, email_verified)
    VALUES (?, ?, ?, datetime('now'), ?, 1)`
  ).run(BUSINESS_NAME, OWNER_EMAIL, hashForStorage(OWNER_PASSWORD), Number(process.env.TRIAL_DAYS || 30));
  business = db.prepare('SELECT * FROM business WHERE id = ?').get(result.lastInsertRowid);
  console.log(`Business created. Login: ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
} else {
  console.log('Business already exists — skipping.');
}

// Sample fleet so the dashboard isn't empty on first login
const vehicleCount = db.prepare('SELECT COUNT(*) c FROM vehicles WHERE business_id = ?').get(business.id).c;
if (vehicleCount === 0) {
  const v1 = db.prepare('INSERT INTO vehicles (business_id, plate_number, model, capacity) VALUES (?, ?, ?, ?)')
    .run(business.id, 'ABC-1234', 'Toyota Coaster', 22);
  const v2 = db.prepare('INSERT INTO vehicles (business_id, plate_number, model, capacity) VALUES (?, ?, ?, ?)')
    .run(business.id, 'XYZ-5678', 'Ford Transit', 14);

  const d1 = db.prepare('INSERT INTO drivers (business_id, name, phone, license_number, vehicle_id) VALUES (?, ?, ?, ?, ?)')
    .run(business.id, 'Marcus Bell', '+15551234567', 'DL-90211', v1.lastInsertRowid);
  const d2 = db.prepare('INSERT INTO drivers (business_id, name, phone, license_number, vehicle_id) VALUES (?, ?, ?, ?, ?)')
    .run(business.id, 'Priya Nair', '+15559876543', 'DL-77420', v2.lastInsertRowid);

  const r1 = db.prepare('INSERT INTO routes (business_id, name, description, driver_id, morning_time, afternoon_time) VALUES (?, ?, ?, ?, ?, ?)')
    .run(business.id, 'North Loop', 'Maple St → Oakwood Elementary', d1.lastInsertRowid, '06:45', '14:45');
  db.prepare('INSERT INTO routes (business_id, name, description, driver_id, morning_time, afternoon_time) VALUES (?, ?, ?, ?, ?, ?)')
    .run(business.id, 'Riverside Loop', 'Riverside Ave → Lincoln Middle School', d2.lastInsertRowid, '07:00', '15:00');

  const p1 = db.prepare('INSERT INTO parents (business_id, whatsapp_number, name) VALUES (?, ?, ?)')
    .run(business.id, '15550001111', 'Dana Ortiz');
  db.prepare(`INSERT INTO students (parent_id, name, school, grade, pickup_address, dropoff_address, route_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(p1.lastInsertRowid, 'Leo Ortiz', 'Oakwood Elementary', '3rd', '12 Maple St', 'Oakwood Elementary', r1.lastInsertRowid);

  console.log('Sample fleet, route, and student created.');
}
