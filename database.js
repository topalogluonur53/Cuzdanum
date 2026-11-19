const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'cuzdanim.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  // --- Users ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // --- Fixed Expenses (Sabit Giderler - Taksitli) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS fixed_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      total_amount REAL NOT NULL,
      installment_amount REAL NOT NULL,
      total_installments INTEGER NOT NULL,
      paid_installments INTEGER DEFAULT 0,
      start_date TEXT,
      due_day INTEGER,
      category TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // --- Card Debts (Kart Borçları) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      card_name TEXT NOT NULL,
      bank_name TEXT,
      debt_amount REAL NOT NULL,
      minimum_payment REAL,
      due_date TEXT,
      statement_date TEXT,
      is_paid INTEGER DEFAULT 0,
      period_month INTEGER,
      period_year INTEGER,
      iban TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Migration for existing database
  try {
    db.exec(`ALTER TABLE card_debts ADD COLUMN iban TEXT`);
  } catch (e) {
    // Column already exists
  }

  // --- Receivables (Alacaklar) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS receivables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      person_name TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      due_date TEXT,
      is_received INTEGER DEFAULT 0,
      is_installment INTEGER DEFAULT 0,
      total_installments INTEGER DEFAULT 1,
      paid_installments INTEGER DEFAULT 0,
      installment_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // --- Payables (Verecekler) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS payables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      person_name TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      due_date TEXT,
      is_paid INTEGER DEFAULT 0,
      is_installment INTEGER DEFAULT 0,
      total_installments INTEGER DEFAULT 1,
      paid_installments INTEGER DEFAULT 0,
      installment_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // --- Savings (Birikimler) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS savings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      unit TEXT,
      purchase_price REAL,
      current_value REAL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // --- Notes (Notlar) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      color TEXT DEFAULT '#ffffff',
      is_pinned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // --- Income (Gelirler) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS income (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      amount REAL NOT NULL,
      is_recurring INTEGER DEFAULT 0,
      recurring_day INTEGER,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // --- Seed default users ---
  seedDefaultData();

  // Backfill demo cards with sample IBANs if they are null/empty
  try {
    db.prepare("UPDATE card_debts SET iban = 'TR64 0006 4000 0011 2345 6789 01' WHERE id = 1 AND (iban IS NULL OR iban = '')").run();
    db.prepare("UPDATE card_debts SET iban = 'TR33 0006 2000 0001 2987 6543 21' WHERE id = 2 AND (iban IS NULL OR iban = '')").run();
    db.prepare("UPDATE card_debts SET iban = 'TR12 0004 6000 5533 1122 3344 55' WHERE id = 3 AND (iban IS NULL OR iban = '')").run();
  } catch (e) {}
}

function seedDefaultData() {
  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (existingAdmin) return; // Already seeded

  const adminHash = bcrypt.hashSync('admin123', 10);
  const demoHash = bcrypt.hashSync('demo123', 10);

  db.prepare(`
    INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)
  `).run('admin', adminHash, 'Yönetici', 'admin');

  const demoResult = db.prepare(`
    INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)
  `).run('demo', demoHash, 'Demo Kullanıcı', 'user');

  const demoUserId = demoResult.lastInsertRowid;

  // --- Demo: Fixed Expenses ---
  const insertExpense = db.prepare(`
    INSERT INTO fixed_expenses (user_id, title, description, total_amount, installment_amount, total_installments, paid_installments, start_date, due_day, category, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertExpense.run(demoUserId, 'iPhone 15 Taksit', 'Apple iPhone 15 128GB', 64999, 5416.58, 12, 4, '2026-07-01', 15, 'Teknoloji', 1);
  insertExpense.run(demoUserId, 'Ev Kirası', 'Aylık kira ödemesi', 120000, 10000, 12, 6, '2026-05-01', 1, 'Konut', 1);
  insertExpense.run(demoUserId, 'Spor Salonu', 'Yıllık üyelik taksiti', 18000, 1500, 12, 9, '2026-02-01', 5, 'Sağlık', 1);

  // --- Demo: Card Debts ---
  const insertCard = db.prepare(`
    INSERT INTO card_debts (user_id, card_name, bank_name, debt_amount, minimum_payment, due_date, statement_date, is_paid, period_month, period_year, iban)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCard.run(demoUserId, 'Maximum Kart', 'İş Bankası', 8450.75, 1200, '2026-12-10', '2026-11-25', 0, 12, 2026, 'TR64 0006 4000 0011 2345 6789 01');
  insertCard.run(demoUserId, 'Bonus Kart', 'Garanti BBVA', 3200.50, 500, '2026-12-15', '2026-11-28', 0, 12, 2026, 'TR33 0006 2000 0001 2987 6543 21');
  insertCard.run(demoUserId, 'Axess Kart', 'Akbank', 12750, 2000, '2026-12-20', '2026-12-05', 0, 12, 2026, 'TR12 0004 6000 5533 1122 3344 55');

  // --- Demo: Receivables ---
  const insertReceivable = db.prepare(`
    INSERT INTO receivables (user_id, person_name, amount, description, due_date, is_received, is_installment, total_installments, paid_installments, installment_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertReceivable.run(demoUserId, 'Ahmet Yılmaz', 2500, 'Yemek borcu', '2026-12-01', 0, 0, 1, 0, 0);
  insertReceivable.run(demoUserId, 'Mehmet Demir', 5000, 'Ödünç para', '2026-12-15', 0, 0, 1, 0, 0);
  insertReceivable.run(demoUserId, 'Ali Kara', 24000, 'Telefon taksiti - kartımdan çekildi', '2026-11-01', 0, 1, 12, 3, 2000);

  // --- Demo: Payables ---
  const insertPayable = db.prepare(`
    INSERT INTO payables (user_id, person_name, amount, description, due_date, is_paid, is_installment, total_installments, paid_installments, installment_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPayable.run(demoUserId, 'Fatma Kaya', 1500, 'Market borcu', '2026-12-05', 0, 0, 1, 0, 0);
  insertPayable.run(demoUserId, 'Hasan Öz', 18000, 'Laptop taksiti - onun kartından', '2026-10-15', 0, 1, 6, 2, 3000);

  // --- Demo: Savings ---
  const insertSaving = db.prepare(`
    INSERT INTO savings (user_id, type, name, amount, unit, purchase_price, current_value, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertSaving.run(demoUserId, 'altin', 'Gram Altın', 10, 'gram', 2800, 59600, 'Yatırım amaçlı');
  insertSaving.run(demoUserId, 'doviz', 'Amerikan Doları', 500, 'USD', 32.50, 25200, 'Döviz biriktirme');
  insertSaving.run(demoUserId, 'hisse', 'THYAO', 100, 'adet', 285, 32800, 'Türk Hava Yolları hissesi');
  insertSaving.run(demoUserId, 'kripto', 'Bitcoin', 0.015, 'adet', 2100000, 47300, 'BTC yatırım');

  // --- Demo: Notes ---
  const insertNote = db.prepare(`
    INSERT INTO notes (user_id, title, content, color, is_pinned)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertNote.run(demoUserId, 'Alışveriş Listesi', 'Süt, ekmek, yumurta, peynir, zeytin', '#fff9c4', 1);
  insertNote.run(demoUserId, 'Hedefler', '1. Acil durum fonu oluştur\n2. Kredi kartı borçlarını kapat\n3. Altın biriktir', '#c8e6c9', 0);
  insertNote.run(demoUserId, 'Fatura Hatırlatma', 'Elektrik: 15\'i\nSu: 20\'si\nDoğalgaz: 25\'i\nİnternet: 1\'i', '#bbdefb', 1);

  // --- Demo: Income ---
  const insertIncome = db.prepare(`
    INSERT INTO income (user_id, source, amount, is_recurring, recurring_day, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertIncome.run(demoUserId, 'Maaş', 42000, 1, 1, 'Aylık maaş');
  insertIncome.run(demoUserId, 'Freelance', 8500, 0, null, 'Web sitesi projesi');
}

initializeDatabase();

module.exports = db;
