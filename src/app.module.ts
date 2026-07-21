import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { StoreModule } from './store/store.module';
import { AuthCoreModule } from './auth/auth-core.module';
import { UsersModule } from './users/users.module';
import { SettingsModule } from './settings/settings.module';
import { ViewsModule } from './views/views.module';
import { AuthModule } from './auth/auth.module';
import { SsoModule } from './sso/sso.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { HealthController } from './health.controller';
import { AuthMiddleware } from './common/auth.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    StoreModule,
    AuthCoreModule,
    UsersModule,
    SettingsModule,
    ViewsModule,
    AuthModule,
    SsoModule,
    ArtifactsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 모든 요청에 세션 부착 + 최초 실행(setup) 유도
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
