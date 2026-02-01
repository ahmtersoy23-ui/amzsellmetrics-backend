import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.SSO_JWT_SECRET || 'IWA_Apps_SSO_JWT_Secret_Key_2026_Min_64_Chars_Required_For_Security';
const APP_CODE = 'amzsellmetrics';

interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  apps: Record<string, string>;
  iat: number;
  exp: number;
}

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

export const authenticateSSO = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please login via SSO.'
      });
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;

    const role = payload.apps[APP_CODE];
    if (!role) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to ' + APP_CODE
      });
    }

    req.ssoUser = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      role: role
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired. Please login again.'
      });
    }
    
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
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
