import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeatureFlagsService } from './feature-flags.service';

@Controller('v1/feature-flags')
@UseGuards(JwtAuthGuard)
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  async getFeatureFlags(@Req() req: any) {
    const userId: string = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    return this.featureFlagsService.getFlagsForUser(userId);
  }
}