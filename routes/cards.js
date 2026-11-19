const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/cards
router.get('/', (req, res) => {
  try {
    const cards = db.prepare('SELECT * FROM card_debts WHERE user_id = ? ORDER BY due_date ASC').all(req.user.id);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// POST /api/cards
router.post('/', (req, res) => {
  try {
    const { card_name, bank_name, debt_amount, minimum_payment, due_date, statement_date, is_paid, period_month, period_year } = req.body;

    if (!card_name || debt_amount === undefined) {
      return res.status(400).json({ error: 'Kart adı ve borç tutarı gerekli' });
    }

    const result = db.prepare(`
      INSERT INTO card_debts (user_id, card_name, bank_name, debt_amount, minimum_payment, due_date, statement_date, is_paid, period_month, period_year)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, card_name, bank_name || null, debt_amount, minimum_payment || null,
      due_date || null, statement_date || null, is_paid || 0, period_month || null, period_year || null
    );

    const card = db.prepare('SELECT * FROM card_debts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(card);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/cards/:id
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const card = db.prepare('SELECT * FROM card_debts WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!card) {
      return res.status(404).json({ error: 'Kart borcu bulunamadı' });
    }

    const { card_name, bank_name, debt_amount, minimum_payment, due_date, statement_date, is_paid, period_month, period_year } = req.body;

    db.prepare(`
      UPDATE card_debts SET card_name = ?, bank_name = ?, debt_amount = ?, minimum_payment = ?,
      due_date = ?, statement_date = ?, is_paid = ?, period_month = ?, period_year = ?
      WHERE id = ? AND user_id = ?
    `).run(
      card_name || card.card_name, bank_name !== undefined ? bank_name : card.bank_name,
      debt_amount !== undefined ? debt_amount : card.debt_amount, minimum_payment !== undefined ? minimum_payment : card.minimum_payment,
      due_date || card.due_date, statement_date || card.statement_date,
      is_paid !== undefined ? is_paid : card.is_paid, period_month || card.period_month, period_year || card.period_year,
      id, req.user.id
    );

    const updated = db.prepare('SELECT * FROM card_debts WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// DELETE /api/cards/:id
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const card = db.prepare('SELECT * FROM card_debts WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!card) {
      return res.status(404).json({ error: 'Kart borcu bulunamadı' });
    }

    db.prepare('DELETE FROM card_debts WHERE id = ? AND user_id = ?').run(id, req.user.id);
    res.json({ message: 'Kart borcu silindi' });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/cards/:id/pay
router.put('/:id/pay', (req, res) => {
  try {
    const { id } = req.params;
    const card = db.prepare('SELECT * FROM card_debts WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!card) {
      return res.status(404).json({ error: 'Kart borcu bulunamadı' });
    }

    db.prepare('UPDATE card_debts SET is_paid = 1 WHERE id = ? AND user_id = ?').run(id, req.user.id);

    const updated = db.prepare('SELECT * FROM card_debts WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

module.exports = router;
