import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { pool, testConnection } from './db';

// Routes
import productsRouter from './routes/products';
import skuRouter from './routes/sku';
import marketplacesRouter from './routes/marketplaces';
import settingsRouter from './routes/settings';
import shippingRouter from './routes/shipping';
import costingRouter from './routes/costing';
import amazonAnalyzerRouter from './routes/amazonAnalyzer';
import authRouter from './routes/auth';

// Services
import { startExchangeRateCron } from './services/exchangeRateCron';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

// JWT Secret - REQUIRED from environment variable (no fallback for security)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required but not set');
  process.exit(1);
}

// CORS Origin - REQUIRED for production
const CORS_ORIGIN = process.env.CORS_ORIGIN;
if (!CORS_ORIGIN || CORS_ORIGIN === '*') {
  console.warn('WARNING: CORS_ORIGIN is not set or is set to "*". This is insecure for production.');
}

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Helmet - Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding from frontend
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin API calls
}));

// General API rate limiter: 100 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for auth endpoints: 10 requests per minute per IP
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: { success: false, error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiter to all routes
app.use(generalLimiter);

// Gzip compression
app.use(compression());

// CORS
app.use(cors({
  origin: CORS_ORIGIN || '*',
  credentials: true,
}));

// JSON parsing
app.use(express.json({ limit: '50mb' }));

// ============================================
// ROLE-BASED ACCESS CONTROL MIDDLEWARE
// All POST/PUT/DELETE requests (except auth) require admin role
// ============================================
app.use((req, res, next) => {
  // Skip for GET requests (read-only)
  if (req.method === 'GET') {
    return next();
  }

  // Skip for auth routes (login, etc.)
  if (req.path.startsWith('/api/auth')) {
    return next();
  }

  // Skip for SSO-authenticated routes (amazon-analyzer uses SSO)
  if (req.path.startsWith('/api/amazon-analyzer')) {
    return next();
  }

  // For POST/PUT/DELETE, require admin token
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required for this operation'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string; role: string };

    if (decoded.role !== 'admin') {
      console.log(`[Auth] Access denied for user ${decoded.username} (role: ${decoded.role}) on ${req.method} ${req.path}`);
      return res.status(403).json({
        success: false,
        error: 'Admin access required for this operation'
      });
    }

    // Admin verified, continue
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'PriceLab API is running',
    timestamp: new Date().toISOString(),
  });
});

// Routes - Apply stricter rate limiter to auth routes
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/products', productsRouter);
app.use('/api/sku', skuRouter);
app.use('/api/marketplaces', marketplacesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/shipping', shippingRouter);
app.use('/api/costing', costingRouter);
app.use('/api/amazon-analyzer', amazonAnalyzerRouter);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// Start server
async function startServer() {
  try {
    console.log('Testing database connection...');
    await testConnection();
    console.log('Database connected successfully');

    app.listen(PORT, () => {
      console.log(`
======================================
   PriceLab Backend Started
======================================

Server running on: http://localhost:${PORT}
Health check: http://localhost:${PORT}/api/health
API Base: http://localhost:${PORT}/api
CORS Origin: ${CORS_ORIGIN}
JWT Secret: [CONFIGURED]
Security: Helmet + Rate Limiting enabled

Press CTRL+C to stop
`);

      // Start exchange rate auto-update (every 12 hours)
      startExchangeRateCron();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
