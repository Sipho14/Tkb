import { Router } from 'express';
import { db } from './db.js';
import { requireAuth } from './auth.js';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

documentsRouter.get('/', (req, res) => {
  const { category } = req.query;
  const rows = category
    ? db.prepare('SELECT id, category, title, file_name, mime_type, notes, created_at FROM documents WHERE business_id = ? AND category = ? ORDER BY created_at DESC')
        .all(req.auth.businessId, category)
    : db.prepare('SELECT id, category, title, file_name, mime_type, notes, created_at FROM documents WHERE business_id = ? ORDER BY created_at DESC')
        .all(req.auth.businessId);
  res.json(rows);
});

documentsRouter.get('/:id/download', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND business_id = ?').get(req.params.id, req.auth.businessId);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json({ file_name: doc.file_name, mime_type: doc.mime_type, file_data: doc.file_data });
});

documentsRouter.post('/', (req, res) => {
  const { category, title, fileName, mimeType, fileData, notes } = req.body;
  if (!category || !title) return res.status(400).json({ error: 'category and title are required' });

  const result = db.prepare(`
    INSERT INTO documents (business_id, category, title, file_name, mime_type, file_data, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(req.auth.businessId, category, title, fileName || null, mimeType || null, fileData || null, notes || null);

  res.json({ id: result.lastInsertRowid });
});

documentsRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM documents WHERE id = ? AND business_id = ?').run(req.params.id, req.auth.businessId);
  res.json({ ok: true });
});
