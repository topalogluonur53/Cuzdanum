// services/marketService.js
// Canlı Piyasa Verileri Servisi: Altın, Gümüş, Döviz, Kripto ve BIST Hisseleri

let cachedRates = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 saniye önbellek

const stockCache = new Map();
const STOCK_CACHE_TTL_MS = 3 * 60 * 1000; // 3 dakika hisse önbelleği

/**
 * Genel piyasa kurlarını (Döviz, Altın, Gümüş, Kripto, BIST100) çeker
 */
async function getMarketRates(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedRates && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedRates;
  }

  const rates = {
    currencies: { USD: 50.46, EUR: 55.54, GBP: 66.30, CHF: 59.50 },
    precious_metals: {
      GRA: 5964.41,
      CEYREKALTIN: 10018,
      YARIMALTIN: 19999,
      TAMALTIN: 39906,
      ATAALTIN: 40945,
      CUMHURIYETALTINI: 40945,
      GUMUS: 71.95
    },
    crypto: {
      BTC: 3154000,
      ETH: 89400,
      SOL: 3710,
      USDT: 50.40
    },
    indices: {
      XU100: 11400.0
    },
    changes: {},
    updated_at: new Date().toISOString()
  };

  // 1. Truncgil API (Altın, Gümüş, Döviz, BIST100)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://finans.truncgil.com/v4/today.json', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data.USD && data.USD.Selling) rates.currencies.USD = parseFloat(data.USD.Selling);
      if (data.EUR && data.EUR.Selling) rates.currencies.EUR = parseFloat(data.EUR.Selling);
      if (data.GBP && data.GBP.Selling) rates.currencies.GBP = parseFloat(data.GBP.Selling);
      if (data.CHF && data.CHF.Selling) rates.currencies.CHF = parseFloat(data.CHF.Selling);

      if (data.GRA && data.GRA.Selling) rates.precious_metals.GRA = parseFloat(data.GRA.Selling);
      if (data.CEYREKALTIN && data.CEYREKALTIN.Selling) rates.precious_metals.CEYREKALTIN = parseFloat(data.CEYREKALTIN.Selling);
      if (data.YARIMALTIN && data.YARIMALTIN.Selling) rates.precious_metals.YARIMALTIN = parseFloat(data.YARIMALTIN.Selling);
      if (data.TAMALTIN && data.TAMALTIN.Selling) rates.precious_metals.TAMALTIN = parseFloat(data.TAMALTIN.Selling);
      if (data.ATAALTIN && data.ATAALTIN.Selling) rates.precious_metals.ATAALTIN = parseFloat(data.ATAALTIN.Selling);
      if (data.CUMHURIYETALTINI && data.CUMHURIYETALTINI.Selling) rates.precious_metals.CUMHURIYETALTINI = parseFloat(data.CUMHURIYETALTINI.Selling);
      if (data.GUMUS && data.GUMUS.Selling) rates.precious_metals.GUMUS = parseFloat(data.GUMUS.Selling);

      if (data.XU100 && data.XU100.Selling) rates.indices.XU100 = parseFloat(data.XU100.Selling);

      // Günlük değişim yüzdeleri
      if (data.GRA) rates.changes['GRA'] = data.GRA.Change;
      if (data.USD) rates.changes['USD'] = data.USD.Change;
      if (data.EUR) rates.changes['EUR'] = data.EUR.Change;
      if (data.GUMUS) rates.changes['GUMUS'] = data.GUMUS.Change;
      if (data.XU100) rates.changes['XU100'] = data.XU100.Change;
    }
  } catch (err) {
    console.warn('[MarketService] Truncgil fetch failed, trying fallbacks:', err.message);
  }

  // 2. Binance API (Kripto TRY çiftleri)
  try {
    const cryptoPairs = [
      { pair: 'BTCTRY', key: 'BTC' },
      { pair: 'ETHTRY', key: 'ETH' },
      { pair: 'SOLTRY', key: 'SOL' },
      { pair: 'USDTTRY', key: 'USDT' }
    ];
    await Promise.allSettled(cryptoPairs.map(async ({ pair, key }) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const d = await res.json();
        if (d && d.price) rates.crypto[key] = parseFloat(d.price);
      }
    }));
  } catch (err) {
    console.warn('[MarketService] Binance fetch failed:', err.message);
  }

  cachedRates = rates;
  lastFetchTime = now;
  return rates;
}

/**
 * BIST veya Yabancı Hisse Fiyatını Yahoo Finance'den çeker
 */
async function getStockPrice(symbol) {
  if (!symbol) return null;
  const cleanSymbol = symbol.trim().toUpperCase();
  const now = Date.now();

  const cached = stockCache.get(cleanSymbol);
  if (cached && (now - cached.time < STOCK_CACHE_TTL_MS)) {
    return cached.price;
  }

  // BIST hissesi kontrolü (eğer nokta yoksa .IS ekle)
  const querySymbol = cleanSymbol.includes('.') ? cleanSymbol : `${cleanSymbol}.IS`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${querySymbol}?interval=1d`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta && meta.regularMarketPrice) {
        const price = meta.regularMarketPrice;
        stockCache.set(cleanSymbol, { price, time: now, currency: meta.currency });
        return price;
      }
    }
  } catch (err) {
    console.warn(`[MarketService] Stock fetch failed for ${querySymbol}:`, err.message);
  }

  // Bulunamazsa varsa eski önbelleği dön
  if (cached) return cached.price;
  return null;
}

/**
 * Kullanıcının birikim kaydını canlı piyasa verisiyle eşleştirip kâr/zarar hesaplar
 */
async function resolveSavingValues(item, marketRates) {
  const type = (item.type || '').toLowerCase();
  const name = (item.name || '').toLowerCase();
  const unit = (item.unit || '').toUpperCase();
  const amount = Number(item.amount) || 0;
  const buyPrice = Number(item.purchase_price) || 0;

  let liveUnitPrice = buyPrice || 0;
  let isLive = false;

  if (type === 'altin') {
    if (name.includes('çeyrek') || name.includes('ceyrek')) {
      liveUnitPrice = marketRates.precious_metals.CEYREKALTIN;
    } else if (name.includes('yarım') || name.includes('yarim')) {
      liveUnitPrice = marketRates.precious_metals.YARIMALTIN;
    } else if (name.includes('tam')) {
      liveUnitPrice = marketRates.precious_metals.TAMALTIN;
    } else if (name.includes('ata') || name.includes('cumhuriyet')) {
      liveUnitPrice = marketRates.precious_metals.ATAALTIN;
    } else {
      liveUnitPrice = marketRates.precious_metals.GRA;
    }
    isLive = true;
  } else if (type === 'gumus') {
    liveUnitPrice = marketRates.precious_metals.GUMUS;
    isLive = true;
  } else if (type === 'doviz') {
    if (name.includes('dolar') || unit === 'USD' || name.includes('usd')) {
      liveUnitPrice = marketRates.currencies.USD;
      isLive = true;
    } else if (name.includes('euro') || unit === 'EUR' || name.includes('eur')) {
      liveUnitPrice = marketRates.currencies.EUR;
      isLive = true;
    } else if (name.includes('sterlin') || unit === 'GBP' || name.includes('gbp')) {
      liveUnitPrice = marketRates.currencies.GBP;
      isLive = true;
    } else if (name.includes('frank') || unit === 'CHF' || name.includes('chf')) {
      liveUnitPrice = marketRates.currencies.CHF;
      isLive = true;
    }
  } else if (type === 'kripto') {
    if (name.includes('bitcoin') || unit === 'BTC' || name.includes('btc')) {
      liveUnitPrice = marketRates.crypto.BTC;
      isLive = true;
    } else if (name.includes('ethereum') || unit === 'ETH' || name.includes('eth')) {
      liveUnitPrice = marketRates.crypto.ETH;
      isLive = true;
    } else if (name.includes('solana') || unit === 'SOL' || name.includes('sol')) {
      liveUnitPrice = marketRates.crypto.SOL;
      isLive = true;
    } else if (name.includes('tether') || unit === 'USDT' || name.includes('usdt')) {
      liveUnitPrice = marketRates.crypto.USDT;
      isLive = true;
    }
  } else if (type === 'hisse') {
    // Varlık adından BIST hisse sembolünü çıkar (örn: "THYAO", "THYAO Türk Hava Yolları", vb.)
    const firstWord = item.name.trim().split(/[\s,]+/)[0];
    const stockPrice = await getStockPrice(firstWord);
    if (stockPrice) {
      liveUnitPrice = stockPrice;
      isLive = true;
    }
  } else if (type === 'nakit') {
    liveUnitPrice = 1.0;
    isLive = true;
  }

  // Canlı fiyat bulunamadıysa veritabanındaki current_value veya purchase_price'a başvur
  if (!isLive && liveUnitPrice === 0) {
    if (amount > 0 && item.current_value > 0) {
      liveUnitPrice = item.current_value / amount;
    } else {
      liveUnitPrice = item.current_value || buyPrice || 0;
    }
  }

  const liveTotalValue = amount * liveUnitPrice;
  const totalCost = amount * (buyPrice > 0 ? buyPrice : liveUnitPrice);
  const profitLossAmount = liveTotalValue - totalCost;
  const profitLossRate = totalCost > 0 ? ((profitLossAmount / totalCost) * 100) : 0;

  return {
    ...item,
    live_unit_price: liveUnitPrice,
    live_total_value: liveTotalValue,
    total_cost: totalCost,
    profit_loss_amount: profitLossAmount,
    profit_loss_rate: profitLossRate,
    is_live: isLive
  };
}

module.exports = {
  getMarketRates,
  getStockPrice,
  resolveSavingValues
};
