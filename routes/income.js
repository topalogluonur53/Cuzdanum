const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/income
router.get('/', (req, res) => {
  try {
    const incomes = db.prepare('SELECT * FROM income WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json(incomes);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// POST /api/income
router.post('/', (req, res) => {
  try {
    const { source, amount, is_recurring, recurring_day, description } = req.body;

    if (!source || amount === undefined) {
      return res.status(400).json({ error: 'Kaynak ve tutar gerekli' });
    }

    const result = db.prepare(`
      INSERT INTO income (user_id, source, amount, is_recurring, recurring_day, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, source, amount, is_recurring || 0, recurring_day || null, description || null);

    const income = db.prepare('SELECT * FROM income WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(income);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/income/:id
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM income WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Gelir bulunamadı' });
    }

    const { source, amount, is_recurring, recurring_day, description } = req.body;

    db.prepare(`
      UPDATE income SET source = ?, amount = ?, is_recurring = ?, recurring_day = ?, description = ?
      WHERE id = ? AND user_id = ?
    `).run(
      source || item.source, amount !== undefined ? amount : item.amount,
      is_recurring !== undefined ? is_recurring : item.is_recurring,
      recurring_day !== undefined ? recurring_day : item.recurring_day,
      description !== undefined ? description : item.description,
      id, req.user.id
    );

    const updated = db.prepare('SELECT * FROM income WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// DELETE /api/income/:id
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM income WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Gelir bulunamadı' });
    }

    db.prepare('DELETE FROM income WHERE id = ? AND user_id = ?').run(id, req.user.id);
    res.json({ message: 'Gelir silindi' });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

module.exports = router;
