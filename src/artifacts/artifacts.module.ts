import { Module } from '@nestjs/common';
import { ArtifactsService } from './artifacts.service';
import { ArtifactsController } from './artifacts.controller';
import { UsersModule } from '../users/users.module';
import { ViewsModule } from '../views/views.module';
import { SessionGuard, WriteGuard } from '../common/guards';

@Module({
  imports: [UsersModule, ViewsModule],
  controllers: [ArtifactsController],
  providers: [ArtifactsService, SessionGuard, WriteGuard],
})
export class ArtifactsModule {}
