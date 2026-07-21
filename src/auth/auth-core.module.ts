import { Module } from '@nestjs/common';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

// 순환참조 방지: 암호/세션 코어는 컨트롤러 없이 별도 모듈로 분리.
@Module({
  providers: [PasswordService, SessionService],
  exports: [PasswordService, SessionService],
})
export class AuthCoreModule {}
