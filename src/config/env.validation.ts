import * as Joi from 'joi';

// 환경변수 검증 (휴먼에러 방지 — 누락 시 부팅 실패로 조기 발견)
export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(4321),
  BASE_URL: Joi.string().uri().default('http://localhost:4321'),
  // 세션 서명키. 프로덕션에선 반드시 주입.
  SESSION_SECRET: Joi.string().min(16).default('dev-insecure-session-secret'),
  DATA_DIR: Joi.string().optional(),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
});
