import { Router } from 'express';
import { db } from './db.js';
import { requireAuth } from './auth.js';

export const staffRouter = Router();
staffRouter.use(requireAuth);

staffRouter.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT st.*, v.plate_number as vehicle_plate FROM staff st
    LEFT JOIN vehicles v ON v.id = st.assigned_vehicle_id
    WHERE st.business_id = ? ORDER BY st.created_at DESC`).all(req.auth.businessId));
});

staffRouter.post('/', (req, res) => {
  const bizId = req.auth.businessId;
  const {
    first_name, surname, id_number, license_code,
    street_address, suburb, city, postal_code,
    department, phone, email, start_date, status,
    emergency_contact_name, emergency_contact_phone, assigned_vehicle_id
  } = req.body;

  if (!first_name || !surname) return res.status(400).json({ error: 'First name and surname are required.' });

  let driverRecordId = null;
  if (department === 'driver') {
    const driverResult = db.prepare('INSERT INTO drivers (business_id, name, phone, license_number, vehicle_id) VALUES (?, ?, ?, ?, ?)')
      .run(bizId, `${first_name} ${surname}`, phone || null, license_code || null, assigned_vehicle_id || null);
    driverRecordId = driverResult.lastInsertRowid;
  }

  const result = db.prepare(`
    INSERT INTO staff (
      business_id, first_name, surname, id_number, license_code,
      street_address, suburb, city, postal_code, department, phone, email,
      start_date, status, emergency_contact_name, emergency_contact_phone,
      assigned_vehicle_id, driver_record_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    bizId, first_name, surname, id_number || null, license_code || null,
    street_address || null, suburb || null, city || null, postal_code || null,
    department || 'other', phone || null, email || null,
    start_date || null, status || 'active',
    emergency_contact_name || null, emergency_contact_phone || null,
    assigned_vehicle_id || null, driverRecordId
  );

  res.json({ id: result.lastInsertRowid });
});

staffRouter.patch('/:id', (req, res) => {
  const staff = db.prepare('SELECT * FROM staff WHERE id = ? AND business_id = ?').get(req.params.id, req.auth.businessId);
  if (!staff) return res.status(404).json({ error: 'Not found' });

  const { status, assigned_vehicle_id } = req.body;
  if (status) {
    db.prepare('UPDATE staff SET status = ? WHERE id = ?').run(status, staff.id);
  }
  if (assigned_vehicle_id !== undefined) {
    db.prepare('UPDATE staff SET assigned_vehicle_id = ? WHERE id = ?').run(assigned_vehicle_id, staff.id);
    if (staff.driver_record_id) {
      db.prepare('UPDATE drivers SET vehicle_id = ? WHERE id = ?').run(assigned_vehicle_id, staff.driver_record_id);
    }
  }
  res.json({ ok: true });
});

staffRouter.delete('/:id', (req, res) => {
  const staff = db.prepare('SELECT * FROM staff WHERE id = ? AND business_id = ?').get(req.params.id, req.auth.businessId);
  if (!staff) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM staff WHERE id = ?').run(staff.id);
  if (staff.driver_record_id) {
    db.prepare('UPDATE drivers SET active = 0 WHERE id = ?').run(staff.driver_record_id);
  }
  res.json({ ok: true });
});
