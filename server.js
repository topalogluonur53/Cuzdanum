const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8686;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// No-cache middleware for SPA HTML to prevent browser caching stale UI
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

// Initialize database (runs table creation + seeding on require)
require('./database');

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/cards', require('./routes/cards'));
app.use('/api/receivables', require('./routes/receivables'));
app.use('/api/payables', require('./routes/payables'));
app.use('/api/savings', require('./routes/savings'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/income', require('./routes/income'));
app.use('/api/dashboard', require('./routes/dashboard'));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Beklenmeyen bir sunucu hatası oluştu' });
});

app.listen(PORT, () => {
  console.log(`Cüzdanım sunucusu http://localhost:${PORT} adresinde çalışıyor`);
});

if (String(PORT) !== '3000') {
  try {
    const s3000 = app.listen(3000, () => {
      console.log(`Cüzdanım sunucusu ayrıca http://localhost:3000 adresinde de çalışıyor`);
    });
    s3000.on('error', () => { /* port 3000 in use or not available */ });
  } catch (e) {}
}

module.exports = app;
