import { Controller, Get, Header } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('healthz')
  @Header('Content-Type', 'text/plain')
  healthz(): string {
    return 'ok';
  }
}
