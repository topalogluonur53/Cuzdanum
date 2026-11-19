const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/admin');

// All admin routes require auth + admin role
router.use(authMiddleware);
router.use(adminMiddleware);

// GET /api/admin/users
router.get('/users', (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, display_name, role, created_at FROM users').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// POST /api/admin/users
router.post('/users', (req, res) => {
  try {
    const { username, password, display_name, role } = req.body;

    if (!username || !password || !display_name) {
      return res.status(400).json({ error: 'Kullanıcı adı, şifre ve görünen ad gerekli' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)'
    ).run(username, hashedPassword, display_name, role || 'user');

    const user = db.prepare('SELECT id, username, display_name, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { username, display_name, role, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    if (username && username !== user.username) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
      if (existing) {
        return res.status(409).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' });
      }
    }

    const updates = {
      username: username || user.username,
      display_name: display_name || user.display_name,
      role: role || user.role
    };

    if (password) {
      updates.password = bcrypt.hashSync(password, 10);
      db.prepare(
        'UPDATE users SET username = ?, display_name = ?, role = ?, password = ? WHERE id = ?'
      ).run(updates.username, updates.display_name, updates.role, updates.password, id);
    } else {
      db.prepare(
        'UPDATE users SET username = ?, display_name = ?, role = ? WHERE id = ?'
      ).run(updates.username, updates.display_name, updates.role, id);
    }

    const updated = db.prepare('SELECT id, username, display_name, role, created_at FROM users WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  try {
    const { id } = req.params;

    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ message: 'Kullanıcı silindi' });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

module.exports = router;
