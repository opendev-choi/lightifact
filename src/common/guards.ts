import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from '../users/users.service';

// 세션 로그인 필수 (읽기 페이지/일반 API)
@Injectable()
export class SessionGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if ((req as any).userEmail) return true;
    throw new UnauthorizedException('login required');
  }
}

// admin 전용
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if ((req as any).user?.admin) return true;
    throw new ForbiddenException('admin only');
  }
}

// 업로드: 세션(브라우저) 또는 Bearer API 토큰(에이전트)
@Injectable()
export class WriteGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if ((req as any).userEmail) return true;
    const m = /^Bearer\s+(.+)$/.exec(req.headers.authorization || '');
    if (m) {
      const email = this.users.findByApiToken(m[1]);
      if (email) {
        (req as any).userEmail = email;
        return true;
      }
    }
    throw new UnauthorizedException('로그인 또는 API 토큰 필요');
  }
}
