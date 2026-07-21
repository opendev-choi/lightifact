import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// 현재 로그인 사용자 email (미들웨어/가드가 세팅)
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return req.userEmail as string;
});
