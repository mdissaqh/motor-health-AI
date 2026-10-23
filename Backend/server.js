/**
 * Motor Health AI — Express Gateway & Work Order Management Server.
 * 
 * Provides centralized REST endpoints for:
 * - Fleet motor catalog & nameplate registry (/api/motors)
 * - MCSA signal analysis and diagnostic run history (/api/diagnostics)
 * - Evidence-linked maintenance work orders (/api/work-orders)
 * - System health check (/api/health)
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Motor Health AI Express Gateway',
    timestamp: new Date().toISOString(),
    uptime_seconds: process.uptime(),
  });
});

// Modular Routes
app.use('/api/motors', require('./routes/motors'));
app.use('/api/diagnostics', require('./routes/diagnostics'));
app.use('/api/work-orders', require('./routes/workOrders'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/vibration', require('./routes/vibration'));

// Global 404 Handler
app.use((req, res) => {
  res.status(404).json({
    status: 'ERROR',
    message: `API endpoint '${req.method} ${req.originalUrl}' not found.`,
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Express Gateway] Unhandled error:', err);
  res.status(err.status || 500).json({
    status: 'ERROR',
    message: err.message || 'Internal Server Error',
  });
});

// Start Server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[*] Express Gateway running on http://127.0.0.1:${PORT}`);
  });
}

module.exports = app;
