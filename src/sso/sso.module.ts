import { Module } from '@nestjs/common';
import { SsoService } from './sso.service';
import { SsoController } from './sso.controller';
import { AuthCoreModule } from '../auth/auth-core.module';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';
import { ViewsModule } from '../views/views.module';
import { AdminGuard, SessionGuard } from '../common/guards';

@Module({
  imports: [AuthCoreModule, UsersModule, SettingsModule, ViewsModule],
  controllers: [SsoController],
  providers: [SsoService, SessionGuard, AdminGuard],
})
export class SsoModule {}
