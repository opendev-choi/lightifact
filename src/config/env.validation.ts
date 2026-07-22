import * as Joi from 'joi';

// 환경변수 검증 (휴먼에러 방지 — 누락 시 부팅 실패로 조기 발견)
export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(4321),
  // 미설정이면 요청 Host 에서 자동 도출 (기본값 두면 process.env 에 주입돼 override 로 잡히므로 default 없음)
  BASE_URL: Joi.string().uri().optional(),
  // 세션은 DB(SQLite)에 저장되므로 시크릿 불필요.
  DATA_DIR: Joi.string().optional(),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
});
