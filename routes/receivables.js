const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/receivables
router.get('/', (req, res) => {
  try {
    const receivables = db.prepare('SELECT * FROM receivables WHERE user_id = ? ORDER BY due_date ASC').all(req.user.id);
    res.json(receivables);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// POST /api/receivables
router.post('/', (req, res) => {
  try {
    const { person_name, amount, description, due_date, is_received, is_installment, total_installments, paid_installments, installment_amount } = req.body;

    if (!person_name || amount === undefined) {
      return res.status(400).json({ error: 'Kişi adı ve tutar gerekli' });
    }

    const instAmount = is_installment ? (installment_amount || (amount / (total_installments || 1))) : 0;

    const result = db.prepare(`
      INSERT INTO receivables (user_id, person_name, amount, description, due_date, is_received, is_installment, total_installments, paid_installments, installment_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, person_name, amount, description || null, due_date || null,
      is_received || 0,
      is_installment ? 1 : 0,
      total_installments || 1,
      paid_installments || 0,
      instAmount
    );

    const receivable = db.prepare('SELECT * FROM receivables WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(receivable);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/receivables/:id
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM receivables WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Alacak bulunamadı' });
    }

    const { person_name, amount, description, due_date, is_received, is_installment, total_installments, paid_installments, installment_amount } = req.body;

    db.prepare(`
      UPDATE receivables SET person_name = ?, amount = ?, description = ?, due_date = ?, is_received = ?,
      is_installment = ?, total_installments = ?, paid_installments = ?, installment_amount = ?
      WHERE id = ? AND user_id = ?
    `).run(
      person_name || item.person_name,
      amount !== undefined ? amount : item.amount,
      description !== undefined ? description : item.description,
      due_date || item.due_date,
      is_received !== undefined ? is_received : item.is_received,
      is_installment !== undefined ? (is_installment ? 1 : 0) : item.is_installment,
      total_installments !== undefined ? total_installments : item.total_installments,
      paid_installments !== undefined ? paid_installments : item.paid_installments,
      installment_amount !== undefined ? installment_amount : item.installment_amount,
      id, req.user.id
    );

    const updated = db.prepare('SELECT * FROM receivables WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// DELETE /api/receivables/:id
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM receivables WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Alacak bulunamadı' });
    }

    db.prepare('DELETE FROM receivables WHERE id = ? AND user_id = ?').run(id, req.user.id);
    res.json({ message: 'Alacak silindi' });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/receivables/:id/receive — Tahsil edildi
router.put('/:id/receive', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM receivables WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Alacak bulunamadı' });
    }

    db.prepare('UPDATE receivables SET is_received = 1 WHERE id = ? AND user_id = ?').run(id, req.user.id);

    const updated = db.prepare('SELECT * FROM receivables WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/receivables/:id/pay-installment — Taksit tahsil et
router.put('/:id/pay-installment', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM receivables WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Alacak bulunamadı' });
    }

    if (!item.is_installment) {
      return res.status(400).json({ error: 'Bu kayıt taksitli değil' });
    }

    if (item.paid_installments >= item.total_installments) {
      return res.status(400).json({ error: 'Tüm taksitler zaten tahsil edilmiş' });
    }

    const newPaid = item.paid_installments + 1;
    const isComplete = newPaid >= item.total_installments ? 1 : 0;

    db.prepare('UPDATE receivables SET paid_installments = ?, is_received = ? WHERE id = ? AND user_id = ?')
      .run(newPaid, isComplete, id, req.user.id);

    const updated = db.prepare('SELECT * FROM receivables WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

module.exports = router;
