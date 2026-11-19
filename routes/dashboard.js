const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/dashboard
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextMonthYear = currentMonth === 12 ? currentYear + 1 : currentYear;

    // Toplam sabit gider (aktif taksitler - bu ay)
    const activeExpenses = db.prepare(`
      SELECT COALESCE(SUM(installment_amount), 0) as total
      FROM fixed_expenses
      WHERE user_id = ? AND is_active = 1
    `).get(userId);

    // Kart borçları toplamı (bu ay ödenmemişler)
    const cardDebts = db.prepare(`
      SELECT COALESCE(SUM(debt_amount), 0) as total
      FROM card_debts
      WHERE user_id = ? AND is_paid = 0
        AND period_month = ? AND period_year = ?
    `).get(userId, currentMonth, currentYear);

    // Tüm ödenmemiş kart borçları
    const totalUnpaidCards = db.prepare(`
      SELECT COALESCE(SUM(debt_amount), 0) as total
      FROM card_debts
      WHERE user_id = ? AND is_paid = 0
    `).get(userId);

    // Toplam verecek (ödenmemiş)
    const totalPayables = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM payables
      WHERE user_id = ? AND is_paid = 0
    `).get(userId);

    // Bu ay toplam çıkış
    const totalExpensesThisMonth = activeExpenses.total + cardDebts.total + totalPayables.total;

    // Gelecek ay tahmini çıkış
    const nextMonthCards = db.prepare(`
      SELECT COALESCE(SUM(debt_amount), 0) as total
      FROM card_debts
      WHERE user_id = ? AND is_paid = 0
        AND period_month = ? AND period_year = ?
    `).get(userId, nextMonth, nextMonthYear);

    const totalExpensesNextMonth = activeExpenses.total + nextMonthCards.total;

    // Toplam alacak (tahsil edilmemiş)
    const totalReceivables = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM receivables
      WHERE user_id = ? AND is_received = 0
    `).get(userId);

    // Toplam birikim değeri
    const totalSavings = db.prepare(`
      SELECT COALESCE(SUM(current_value), 0) as total
      FROM savings
      WHERE user_id = ?
    `).get(userId);

    // Yaklaşan ödemeler (30 gün içinde)
    const thirtyDaysLater = new Date(now);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const thirtyDaysStr = thirtyDaysLater.toISOString().split('T')[0];
    const todayStr = now.toISOString().split('T')[0];

    const upcomingCardPayments = db.prepare(`
      SELECT card_name as title, debt_amount as amount, due_date, 'card' as type
      FROM card_debts
      WHERE user_id = ? AND is_paid = 0 AND due_date BETWEEN ? AND ?
      ORDER BY due_date ASC
    `).all(userId, todayStr, thirtyDaysStr);

    const upcomingPayables = db.prepare(`
      SELECT person_name as title, amount, due_date, 'payable' as type
      FROM payables
      WHERE user_id = ? AND is_paid = 0 AND due_date BETWEEN ? AND ?
      ORDER BY due_date ASC
    `).all(userId, todayStr, thirtyDaysStr);

    const upcomingPayments = [...upcomingCardPayments, ...upcomingPayables]
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    // Kalan taksitler
    const remainingInstallments = db.prepare(`
      SELECT title, installment_amount, total_installments, paid_installments,
        (total_installments - paid_installments) as remaining, due_day, category, start_date
      FROM fixed_expenses
      WHERE user_id = ? AND is_active = 1
      ORDER BY due_day ASC
    `).all(userId);

    // Gelir toplamı
    const totalIncome = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM income
      WHERE user_id = ?
    `).get(userId);

    // Düzenli gelir toplamı
    const recurringIncome = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM income
      WHERE user_id = ? AND is_recurring = 1
    `).get(userId);

    res.json({
      this_month: {
        total_expenses: totalExpensesThisMonth,
        fixed_expenses: activeExpenses.total,
        card_debts: cardDebts.total,
        payables: totalPayables.total
      },
      next_month: {
        estimated_expenses: totalExpensesNextMonth
      },
      total_receivables: totalReceivables.total,
      total_unpaid_cards: totalUnpaidCards.total,
      total_savings: totalSavings.total,
      total_income: totalIncome.total,
      recurring_income: recurringIncome.total,
      upcoming_payments: upcomingPayments,
      remaining_installments: remainingInstallments
    });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

module.exports = router;
