import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthCoreModule } from '../auth/auth-core.module';
import { SettingsModule } from '../settings/settings.module';
import { ViewsModule } from '../views/views.module';
import { AdminGuard, SessionGuard } from '../common/guards';

@Module({
  imports: [AuthCoreModule, SettingsModule, ViewsModule],
  controllers: [UsersController],
  providers: [UsersService, SessionGuard, AdminGuard],
  exports: [UsersService],
})
export class UsersModule {}
