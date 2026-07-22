import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { UsersService } from '../users/users.service';
import { SessionService, SESSION_COOKIE } from '../auth/session.service';
import { parseCookieHeader } from './cookies';

// 세션 쿠키 → req.userEmail/req.user 부착 + 최초 실행(setup) 유도.
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private readonly users: UsersService,
    private readonly session: SessionService,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const cookies = (req as any).cookies ?? parseCookieHeader(req.headers.cookie);
    const email = this.session.verify(cookies[SESSION_COOKIE]);
    const user = email ? this.users.get(email) : undefined;
    if (email && user) {
      (req as any).userEmail = email;
      (req as any).user = user;
    }

    const path = (req.originalUrl || req.url).split('?')[0];
    if (this.users.count() === 0) {
      const open = ['/setup', '/api/setup', '/healthz'];
      if (!open.includes(path) && !path.startsWith('/install/')) {
        if (path.startsWith('/api/')) {
          res.status(401).json({ error: 'not initialized' });
          return;
        }
        res.redirect('/setup');
        return;
      }
    } else if (path === '/setup') {
      res.redirect('/login');
      return;
    }
    next();
  }
}
