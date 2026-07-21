import { Injectable } from '@nestjs/common';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { User } from '../common/types';

// 비밀번호 해싱: scrypt (Node 내장). 평문 저장 안 함.
@Injectable()
export class PasswordService {
  hash(password: string, salt: string = randomBytes(16).toString('hex')): { salt: string; hash: string } {
    return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
  }

  verify(password: string, user: Pick<User, 'salt' | 'hash'>): boolean {
    if (!user.hash || !user.salt) return false;
    const computed = Buffer.from(scryptSync(password, user.salt, 64).toString('hex'));
    const stored = Buffer.from(user.hash);
    return computed.length === stored.length && timingSafeEqual(computed, stored);
  }

  newApiToken(): string {
    return 'lf_' + randomBytes(24).toString('hex');
  }
}
