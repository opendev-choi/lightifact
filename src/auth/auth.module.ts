import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthCoreModule } from './auth-core.module';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';
import { ViewsModule } from '../views/views.module';

@Module({
  imports: [AuthCoreModule, UsersModule, SettingsModule, ViewsModule],
  controllers: [AuthController],
})
export class AuthModule {}
