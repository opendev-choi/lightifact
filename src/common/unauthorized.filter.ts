import { ArgumentsHost, Catch, ExceptionFilter, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';

// 미인증 시: 브라우저 GET 은 /login 으로 리다이렉트, API 는 401 JSON.
@Catch(UnauthorizedException)
export class UnauthorizedFilter implements ExceptionFilter {
  catch(exception: UnauthorizedException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const wantsHtml = req.method === 'GET' && (req.headers.accept || '').includes('text/html') && !req.path.startsWith('/api/');
    if (wantsHtml) {
      res.redirect('/login');
      return;
    }
    const body = exception.getResponse();
    res.status(401).json(typeof body === 'string' ? { error: body } : body);
  }
}
