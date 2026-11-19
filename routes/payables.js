const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/payables
router.get('/', (req, res) => {
  try {
    const payables = db.prepare('SELECT * FROM payables WHERE user_id = ? ORDER BY due_date ASC').all(req.user.id);
    res.json(payables);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// POST /api/payables
router.post('/', (req, res) => {
  try {
    const { person_name, amount, description, due_date, is_paid, is_installment, total_installments, paid_installments, installment_amount } = req.body;

    if (!person_name || amount === undefined) {
      return res.status(400).json({ error: 'Kişi adı ve tutar gerekli' });
    }

    const instAmount = is_installment ? (installment_amount || (amount / (total_installments || 1))) : 0;

    const result = db.prepare(`
      INSERT INTO payables (user_id, person_name, amount, description, due_date, is_paid, is_installment, total_installments, paid_installments, installment_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, person_name, amount, description || null, due_date || null,
      is_paid || 0,
      is_installment ? 1 : 0,
      total_installments || 1,
      paid_installments || 0,
      instAmount
    );

    const payable = db.prepare('SELECT * FROM payables WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(payable);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/payables/:id
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM payables WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Verecek bulunamadı' });
    }

    const { person_name, amount, description, due_date, is_paid, is_installment, total_installments, paid_installments, installment_amount } = req.body;

    db.prepare(`
      UPDATE payables SET person_name = ?, amount = ?, description = ?, due_date = ?, is_paid = ?,
      is_installment = ?, total_installments = ?, paid_installments = ?, installment_amount = ?
      WHERE id = ? AND user_id = ?
    `).run(
      person_name || item.person_name,
      amount !== undefined ? amount : item.amount,
      description !== undefined ? description : item.description,
      due_date || item.due_date,
      is_paid !== undefined ? is_paid : item.is_paid,
      is_installment !== undefined ? (is_installment ? 1 : 0) : item.is_installment,
      total_installments !== undefined ? total_installments : item.total_installments,
      paid_installments !== undefined ? paid_installments : item.paid_installments,
      installment_amount !== undefined ? installment_amount : item.installment_amount,
      id, req.user.id
    );

    const updated = db.prepare('SELECT * FROM payables WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// DELETE /api/payables/:id
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM payables WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Verecek bulunamadı' });
    }

    db.prepare('DELETE FROM payables WHERE id = ? AND user_id = ?').run(id, req.user.id);
    res.json({ message: 'Verecek silindi' });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/payables/:id/pay — Ödendi
router.put('/:id/pay', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM payables WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Verecek bulunamadı' });
    }

    db.prepare('UPDATE payables SET is_paid = 1 WHERE id = ? AND user_id = ?').run(id, req.user.id);

    const updated = db.prepare('SELECT * FROM payables WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/payables/:id/pay-installment — Taksit öde
router.put('/:id/pay-installment', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM payables WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Verecek bulunamadı' });
    }

    if (!item.is_installment) {
      return res.status(400).json({ error: 'Bu kayıt taksitli değil' });
    }

    if (item.paid_installments >= item.total_installments) {
      return res.status(400).json({ error: 'Tüm taksitler zaten ödenmiş' });
    }

    const newPaid = item.paid_installments + 1;
    const isComplete = newPaid >= item.total_installments ? 1 : 0;

    db.prepare('UPDATE payables SET paid_installments = ?, is_paid = ? WHERE id = ? AND user_id = ?')
      .run(newPaid, isComplete, id, req.user.id);

    const updated = db.prepare('SELECT * FROM payables WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

module.exports = router;
