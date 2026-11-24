import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReferralsService } from './referrals.service';
import { ValidateReferralCodeDto } from './dto/validate-referral-code.dto';

@Controller('v1/referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get('me')
  async getMyReferralInfo() {
    return this.referralsService.getReferralInfo();
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateReferralCode(@Body() dto: ValidateReferralCodeDto) {
    return this.referralsService.validateReferralCode(dto.code);
  }
}