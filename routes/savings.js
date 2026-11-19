const express = require('express');
const router = express.Router();
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const marketService = require('../services/marketService');

router.use(authMiddleware);

// GET /api/savings/rates — Canlı piyasa kurları ve günlük değişimler
router.get('/rates', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    const rates = await marketService.getMarketRates(force);
    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: 'Piyasa verileri alınamadı: ' + err.message });
  }
});

// GET /api/savings — Kullanıcı birikimleri (Canlı piyasa verileri ve kâr/zarar ile zenginleştirilmiş)
router.get('/', async (req, res) => {
  try {
    const rawSavings = db.prepare('SELECT * FROM savings WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    const rates = await marketService.getMarketRates();

    const updateStmt = db.prepare('UPDATE savings SET current_value = ? WHERE id = ? AND user_id = ?');

    const enrichedSavings = await Promise.all(rawSavings.map(async item => {
      const resolved = await marketService.resolveSavingValues(item, rates);
      // Veritabanındaki current_value alanını canlı toplam değer ile senkronize et
      if (resolved.live_total_value && Math.round(resolved.live_total_value) !== Math.round(item.current_value)) {
        try {
          updateStmt.run(resolved.live_total_value, item.id, req.user.id);
        } catch (_) {}
      }
      return resolved;
    }));

    res.json(enrichedSavings);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// POST /api/savings/sync — Tüm birikimleri anlık canlı piyasa fiyatlarıyla eşitle
router.post('/sync', async (req, res) => {
  try {
    const rates = await marketService.getMarketRates(true);
    const rawSavings = db.prepare('SELECT * FROM savings WHERE user_id = ?').all(req.user.id);
    const updateStmt = db.prepare('UPDATE savings SET current_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?');

    const enriched = await Promise.all(rawSavings.map(async item => {
      const resolved = await marketService.resolveSavingValues(item, rates);
      if (resolved.live_total_value) {
        updateStmt.run(resolved.live_total_value, item.id, req.user.id);
      }
      return resolved;
    }));

    res.json({
      message: 'Birikimler güncel piyasa verileriyle eşitlendi',
      rates,
      savings: enriched
    });
  } catch (err) {
    res.status(500).json({ error: 'Eşitleme hatası: ' + err.message });
  }
});

// GET /api/savings/summary — Türe göre toplam değerler, maliyet ve kâr/zarar özeti
router.get('/summary', async (req, res) => {
  try {
    const rawSavings = db.prepare('SELECT * FROM savings WHERE user_id = ?').all(req.user.id);
    const rates = await marketService.getMarketRates();

    let grandTotalValue = 0;
    let grandTotalCost = 0;
    const byTypeMap = {};

    for (const item of rawSavings) {
      const resolved = await marketService.resolveSavingValues(item, rates);
      grandTotalValue += (resolved.live_total_value || 0);
      grandTotalCost += (resolved.total_cost || 0);

      const t = resolved.type || 'diger';
      if (!byTypeMap[t]) {
        byTypeMap[t] = {
          type: t,
          count: 0,
          total_current_value: 0,
          total_purchase_value: 0,
          profit_loss: 0
        };
      }
      byTypeMap[t].count += 1;
      byTypeMap[t].total_current_value += (resolved.live_total_value || 0);
      byTypeMap[t].total_purchase_value += (resolved.total_cost || 0);
      byTypeMap[t].profit_loss += (resolved.profit_loss_amount || 0);
    }

    const grandProfitLoss = grandTotalValue - grandTotalCost;
    const grandProfitLossRate = grandTotalCost > 0 ? ((grandProfitLoss / grandTotalCost) * 100) : 0;

    res.json({
      grand_total: grandTotalValue,
      grand_cost: grandTotalCost,
      grand_profit_loss: grandProfitLoss,
      grand_profit_loss_rate: grandProfitLossRate,
      by_type: Object.values(byTypeMap),
      rates_updated_at: rates.updated_at
    });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// POST /api/savings
router.post('/', async (req, res) => {
  try {
    const { type, name, amount, unit, purchase_price, current_value, notes } = req.body;

    if (!type || !name || amount === undefined) {
      return res.status(400).json({ error: 'Tür, ad ve miktar gerekli' });
    }

    // Canlı fiyat hesaplama
    const rates = await marketService.getMarketRates();
    const tempItem = { type, name, amount: parseFloat(amount) || 0, unit, purchase_price: parseFloat(purchase_price) || 0 };
    const resolved = await marketService.resolveSavingValues(tempItem, rates);

    const finalVal = resolved.live_total_value || parseFloat(current_value) || (tempItem.amount * (tempItem.purchase_price || 0));

    const result = db.prepare(`
      INSERT INTO savings (user_id, type, name, amount, unit, purchase_price, current_value, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      type,
      name,
      tempItem.amount,
      unit || null,
      tempItem.purchase_price || null,
      finalVal,
      notes || null
    );

    const saving = db.prepare('SELECT * FROM savings WHERE id = ?').get(result.lastInsertRowid);
    const enriched = await marketService.resolveSavingValues(saving, rates);
    res.status(201).json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// PUT /api/savings/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM savings WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Birikim bulunamadı' });
    }

    const { type, name, amount, unit, purchase_price, current_value, notes } = req.body;

    const newType = type || item.type;
    const newName = name || item.name;
    const newAmount = amount !== undefined ? parseFloat(amount) : item.amount;
    const newUnit = unit !== undefined ? unit : item.unit;
    const newBuyPrice = purchase_price !== undefined ? parseFloat(purchase_price) : item.purchase_price;

    // Canlı piyasa verisiyle hesapla
    const rates = await marketService.getMarketRates();
    const tempItem = { type: newType, name: newName, amount: newAmount, unit: newUnit, purchase_price: newBuyPrice };
    const resolved = await marketService.resolveSavingValues(tempItem, rates);

    const finalVal = resolved.live_total_value || (current_value !== undefined ? parseFloat(current_value) : item.current_value);

    db.prepare(`
      UPDATE savings SET type = ?, name = ?, amount = ?, unit = ?, purchase_price = ?, current_value = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(
      newType, newName, newAmount,
      newUnit, newBuyPrice,
      finalVal, notes !== undefined ? notes : item.notes,
      id, req.user.id
    );

    const updated = db.prepare('SELECT * FROM savings WHERE id = ?').get(id);
    const enriched = await marketService.resolveSavingValues(updated, rates);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

// DELETE /api/savings/:id
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT * FROM savings WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Birikim bulunamadı' });
    }

    db.prepare('DELETE FROM savings WHERE id = ? AND user_id = ?').run(id, req.user.id);
    res.json({ message: 'Birikim silindi' });
  } catch (err) {
    res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
});

module.exports = router;
