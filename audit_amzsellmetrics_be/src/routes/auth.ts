/**
 * Auth Routes - JWT-based authentication for AmzSellMetrics
 */

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { query } from '../db';

const router = Router();

// JWT Secret - REQUIRED from environment variable (no fallback for security)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required but not set');
}
const JWT_EXPIRES_IN = '7d'; // 7 days

// ============================================
// RATE LIMITING
// ============================================

/**
 * Rate limiter for login endpoint
 * - 5 attempts per 15 minutes per IP
 * - Prevents brute force attacks
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { success: false, error: 'Too many login attempts from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

/**
 * Rate limiter for general auth endpoints
 * - 20 requests per 15 minutes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many requests from this IP, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for password change
 * - 3 attempts per hour
 */
const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: { success: false, error: 'Too many password change attempts, please try again after 1 hour' },
  standardHeaders: true,
  legacyHeaders: false,
});


// ============================================
// INPUT VALIDATION HELPERS
// ============================================

/**

/**
 * Validate email format (basic RFC 5322)
 */
const isValidEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false; // Max email length
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
};

/**
 * Validate password strength
 * - 8-128 characters
 * - At least one lowercase, uppercase, digit
 */
const isValidPassword = (password: string): { valid: boolean; error?: string } => {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password must be at most 128 characters' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one digit' };
  }
  return { valid: true };
};

/**
 * Sanitize string input (trim and limit length)
 */
const sanitizeString = (input: any, maxLength: number = 1000): string => {
  if (!input || typeof input !== 'string') return '';
  return input.trim().slice(0, maxLength);
};

// Types
interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'viewer';
  is_active: boolean;
}

interface JwtPayload {
  userId: number;
  username: string;
  role: string;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Verify JWT token middleware
 */
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ success: false, error: 'Invalid or expired token' });
  }
};

/**
 * Check if user is admin
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// ============================================
// ROUTES
// ============================================

/**
 * POST /api/auth/login
 * Login with username and password
 */
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const email = sanitizeString(req.body.email, 254).toLowerCase();
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    // Basic input validation (don't reveal if username format is wrong)
    if (typeof password !== 'string' || password.length > 128) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Find user
    const users = await query(
      'SELECT id, username, email, password_hash, role, is_active FROM amzsellmetrics_users WHERE LOWER(email) = $1',
      [email]
    );

    if (users.length === 0) {
      // Timing-safe: still do a bcrypt compare even if user not found
      await bcrypt.compare(password, '$2a$10$dummy.hash.to.prevent.timing.attacks');
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(401).json({ success: false, error: 'Account is disabled' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Update last login
    await query('UPDATE amzsellmetrics_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    console.log(`[Auth] User logged in: ${email} (role: ${user.role})`);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error: any) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

/**
 * GET /api/auth/verify
 * Verify token and return user info
 */
router.get('/verify', authLimiter, authenticateToken, async (req: Request, res: Response) => {
  try {
    const users = await query(
      'SELECT id, username, email, role, is_active FROM amzsellmetrics_users WHERE id = $1',
      [req.user!.userId]
    );

    if (users.length === 0 || !users[0].is_active) {
      return res.status(401).json({ success: false, error: 'User not found or disabled' });
    }

    const user = users[0];

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error: any) {
    console.error('[Auth] Verify error:', error);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

/**
 * POST /api/auth/change-password
 * Change user's own password
 */
router.post('/change-password', passwordChangeLimiter, authenticateToken, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new password required' });
    }

    // Validate new password
    const passwordCheck = isValidPassword(newPassword);
    if (!passwordCheck.valid) {
      return res.status(400).json({ success: false, error: passwordCheck.error });
    }

    // Get current user
    const users = await query('SELECT password_hash FROM amzsellmetrics_users WHERE id = $1', [req.user!.userId]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    // Hash new password with higher cost factor
    const newHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await query(
      'UPDATE amzsellmetrics_users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHash, req.user!.userId]
    );

    console.log(`[Auth] Password changed for user: ${req.user!.username}`);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error: any) {
    console.error('[Auth] Change password error:', error);
    res.status(500).json({ success: false, error: 'Password change failed' });
  }
});

// ============================================
// ADMIN ROUTES - User Management
// ============================================

/**
 * GET /api/auth/users
 * Get all users (admin only)
 */
router.get('/users', authLimiter, authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const users = await query(
      'SELECT id, username, email, role, is_active, created_at, last_login FROM amzsellmetrics_users ORDER BY created_at DESC'
    );

    res.json({ success: true, data: users });
  } catch (error: any) {
    console.error('[Auth] Get users error:', error);
    res.status(500).json({ success: false, error: 'Failed to get users' });
  }
});

/**
 * POST /api/auth/users
 * Create new user (admin only)
 */
router.post('/users', authLimiter, authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const email = sanitizeString(req.body.email, 254).toLowerCase();
    const password = req.body.password;
    const role = req.body.role || 'viewer';

    // Validate email if provided
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    // Validate password
    const passwordCheck = isValidPassword(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ success: false, error: passwordCheck.error });
    }

    // Validate role
    if (!['admin', 'viewer'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    // Check if username exists
    const existing = await query('SELECT id FROM amzsellmetrics_users WHERE LOWER(email) = $1', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }

    // Hash password with higher cost factor
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await query(
      'INSERT INTO amzsellmetrics_users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, is_active, created_at',
      [email.split('@')[0], email, passwordHash, role]
    );

    console.log(`[Auth] User created: ${email} (role: ${role}) by ${req.user!.username}`);

    res.json({ success: true, data: result[0] });
  } catch (error: any) {
    console.error('[Auth] Create user error:', error);
    res.status(500).json({ success: false, error: 'Failed to create user' });
  }
});

/**
 * PUT /api/auth/users/:id
 * Update user (admin only)
 */
router.put('/users/:id', authLimiter, authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    // Validate userId
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }

    const { role, is_active, password } = req.body;
    const email = req.body.email !== undefined ? sanitizeString(req.body.email, 254) : undefined;

    // Prevent admin from disabling themselves
    if (req.user!.userId === userId && is_active === false) {
      return res.status(400).json({ success: false, error: 'Cannot disable your own account' });
    }

    // Validate email if provided
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    // Validate password if provided
    if (password) {
      const passwordCheck = isValidPassword(password);
      if (!passwordCheck.valid) {
        return res.status(400).json({ success: false, error: passwordCheck.error });
      }
    }

    // Validate role if provided
    if (role !== undefined && !['admin', 'viewer'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(email || null);
    }
    if (role !== undefined && ['admin', 'viewer'].includes(role)) {
      updates.push(`role = $${paramCount++}`);
      values.push(role);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${paramCount++}`);
      values.push(hash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const result = await query(
      `UPDATE amzsellmetrics_users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, username, email, role, is_active`,
      values
    );

    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    console.log(`[Auth] User updated: ${result[0].username} by ${req.user!.username}`);

    res.json({ success: true, data: result[0] });
  } catch (error: any) {
    console.error('[Auth] Update user error:', error);
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/auth/users/:id
 * Delete user (admin only)
 */
router.delete('/users/:id', authLimiter, authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    // Validate userId
    if (isNaN(userId) || userId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }

    // Prevent admin from deleting themselves
    if (req.user!.userId === userId) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
    }

    const result = await query('DELETE FROM amzsellmetrics_users WHERE id = $1 RETURNING username', [userId]);

    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    console.log(`[Auth] User deleted: ${result[0].username} by ${req.user!.username}`);

    res.json({ success: true, message: 'User deleted' });
  } catch (error: any) {
    console.error('[Auth] Delete user error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

export default router;
