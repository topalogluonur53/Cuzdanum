const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/notes
router.get('/', (req, res) => {
  try {
    const notes = db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY is_pinned DESC, updated_at DESC').all(req.user.id);
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// POST /api/notes
router.post('/', (req, res) => {
  try {
    const { title, content, color, is_pinned } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Başlık gerekli' });
    }

    const result = db.prepare(`
      INSERT INTO notes (user_id, title, content, color, is_pinned)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, title, content || null, color || '#ffffff', is_pinned || 0);

    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(note);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/notes/:id
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Not bulunamadı' });
    }

    const { title, content, color, is_pinned } = req.body;

    db.prepare(`
      UPDATE notes SET title = ?, content = ?, color = ?, is_pinned = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(
      title || item.title, content !== undefined ? content : item.content,
      color || item.color, is_pinned !== undefined ? is_pinned : item.is_pinned,
      id, req.user.id
    );

    const updated = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Not bulunamadı' });
    }

    db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, req.user.id);
    res.json({ message: 'Not silindi' });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/notes/:id/pin — Sabitle/kaldır
router.put('/:id/pin', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Not bulunamadı' });
    }

    const newPinned = item.is_pinned ? 0 : 1;
    db.prepare('UPDATE notes SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
      .run(newPinned, id, req.user.id);

    const updated = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

module.exports = router;
