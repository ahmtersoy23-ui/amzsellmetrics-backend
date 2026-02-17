import { Request, Response, NextFunction } from 'express';
import axios from 'axios';

const SSO_VERIFY_URL = process.env.SSO_VERIFY_URL || 'https://apps.iwa.web.tr/api/auth/verify';
const APP_CODE = 'amzsellmetrics';

declare global {
  namespace Express {
    interface Request {
      ssoUser?: {
        id: string;
        email: string;
        name: string;
        picture?: string;
        role: string;
      };
    }
  }
}

export const authenticateSSO = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please login via SSO.'
      });
    }

    const token = authHeader.substring(7);

    // Verify token with SSO backend (no local JWT secret needed)
    const response = await axios.post(
      SSO_VERIFY_URL,
      { token, app_code: APP_CODE },
      { timeout: 5000 }
    );

    if (!response.data.success) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token. Please login again.'
      });
    }

    const { user, role } = response.data.data;

    if (!role) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to ' + APP_CODE
      });
    }

    req.ssoUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      role: role
    };

    next();
  } catch (error: any) {
    // Handle network errors or SSO backend unavailable
    if (error.response?.status === 403) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to ' + APP_CODE
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Token verification failed. Please login again.'
    });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.ssoUser) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.ssoUser.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    next();
  };
};

export const requireAdmin = requireRole(['admin']);
export const requireEditor = requireRole(['admin', 'editor']);
