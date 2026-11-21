const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/expenses
router.get('/', (req, res) => {
  try {
    const expenses = db.prepare('SELECT * FROM fixed_expenses WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// POST /api/expenses
router.post('/', (req, res) => {
  try {
    const { title, description, total_amount, installment_amount, total_installments, paid_installments, start_date, due_day, category, is_active } = req.body;

    if (!title || !total_amount || !installment_amount || !total_installments) {
      return res.status(400).json({ error: 'Başlık, toplam tutar, taksit tutarı ve taksit sayısı gerekli' });
    }

    const result = db.prepare(`
      INSERT INTO fixed_expenses (user_id, title, description, total_amount, installment_amount, total_installments, paid_installments, start_date, due_day, category, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, title, description || null, total_amount, installment_amount,
      total_installments, paid_installments || 0, start_date || null, due_day || null,
      category || null, is_active !== undefined ? is_active : 1
    );

    const expense = db.prepare('SELECT * FROM fixed_expenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/expenses/:id
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const expense = db.prepare('SELECT * FROM fixed_expenses WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!expense) {
      return res.status(404).json({ error: 'Gider bulunamadı' });
    }

    const { title, description, total_amount, installment_amount, total_installments, paid_installments, start_date, due_day, category, is_active } = req.body;

    db.prepare(`
      UPDATE fixed_expenses SET title = ?, description = ?, total_amount = ?, installment_amount = ?,
      total_installments = ?, paid_installments = ?, start_date = ?, due_day = ?, category = ?, is_active = ?
      WHERE id = ? AND user_id = ?
    `).run(
      title || expense.title, description !== undefined ? description : expense.description,
      total_amount || expense.total_amount, installment_amount || expense.installment_amount,
      total_installments || expense.total_installments, paid_installments !== undefined ? paid_installments : expense.paid_installments,
      start_date || expense.start_date, due_day || expense.due_day,
      category !== undefined ? category : expense.category, is_active !== undefined ? is_active : expense.is_active,
      id, req.user.id
    );

    const updated = db.prepare('SELECT * FROM fixed_expenses WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const expense = db.prepare('SELECT * FROM fixed_expenses WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!expense) {
      return res.status(404).json({ error: 'Gider bulunamadı' });
    }

    db.prepare('DELETE FROM fixed_expenses WHERE id = ? AND user_id = ?').run(id, req.user.id);
    res.json({ message: 'Gider silindi' });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/expenses/:id/pay — Taksit öde
router.put('/:id/pay', (req, res) => {
  try {
    const { id } = req.params;
    const expense = db.prepare('SELECT * FROM fixed_expenses WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!expense) {
      return res.status(404).json({ error: 'Gider bulunamadı' });
    }

    if (expense.paid_installments >= expense.total_installments) {
      return res.status(400).json({ error: 'Tüm taksitler zaten ödenmiş' });
    }

    const paidInstallments = Number(expense.paid_installments) || 0;
    const totalInstallments = Number(expense.total_installments) || 1;
    const currentMonthParts = String(req.body && req.body.current_month || '').match(/^(\d{4})-(\d{2})$/);
    const parsedYear = currentMonthParts ? Number(currentMonthParts[1]) : 0;
    const parsedMonth = currentMonthParts ? Number(currentMonthParts[2]) : 0;
    const requestedMonth = currentMonthParts && parsedMonth >= 1 && parsedMonth <= 12
      ? [parsedYear, parsedMonth]
      : [new Date().getFullYear(), new Date().getMonth() + 1];
    const startParts = String(expense.start_date || '').split('-').map(Number);
    let currentInstallmentIndex = 0;
    if (startParts.length === 3 && startParts.every(Number.isFinite) && startParts[1] >= 1 && startParts[1] <= 12) {
      currentInstallmentIndex = Math.max(0,
        (requestedMonth[0] - startParts[0]) * 12 + (requestedMonth[1] - startParts[1]));
    }

    // Bring a behind schedule up to the installment for the month being paid.
    // This makes the next unpaid installment advance to the following month.
    const newPaid = Math.min(totalInstallments,
      Math.max(paidInstallments + 1, currentInstallmentIndex + 1));
    const isActive = newPaid < expense.total_installments ? 1 : 0;

    db.prepare('UPDATE fixed_expenses SET paid_installments = ?, is_active = ? WHERE id = ? AND user_id = ?')
      .run(newPaid, isActive, id, req.user.id);

    const updated = db.prepare('SELECT * FROM fixed_expenses WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/expenses/:id/unpay — Taksit ödemesini geri al
router.put('/:id/unpay', (req, res) => {
  try {
    const { id } = req.params;
    const expense = db.prepare('SELECT * FROM fixed_expenses WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!expense) {
      return res.status(404).json({ error: 'Gider bulunamadı' });
    }

    if (expense.paid_installments <= 0) {
      return res.status(400).json({ error: 'Geri alınacak ödenmiş taksit bulunmuyor' });
    }

    const newPaid = Math.max(0, expense.paid_installments - 1);
    const isActive = 1;

    db.prepare('UPDATE fixed_expenses SET paid_installments = ?, is_active = ? WHERE id = ? AND user_id = ?')
      .run(newPaid, isActive, id, req.user.id);

    const updated = db.prepare('SELECT * FROM fixed_expenses WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

module.exports = router;
