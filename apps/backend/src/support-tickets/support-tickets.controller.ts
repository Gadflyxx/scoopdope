import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { CreateTicketReplyDto } from './dto/create-ticket-reply.dto';
import { SupportTicketsService } from './support-tickets.service';

interface AuthenticatedRequest {
  user: {
    id: string;
    role: UserRole;
  };
}

@Controller('v1/support-tickets')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSupportTicketDto,
  ) {
    return this.supportTicketsService.create(req.user.id, dto);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    if (req.user.role === UserRole.ADMIN) {
      return this.supportTicketsService.listAllForAdmin();
    }
    return this.supportTicketsService.listForUser(req.user.id);
  }

  @Post(':id/reply')
  @Roles(UserRole.ADMIN)
  reply(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTicketReplyDto,
  ) {
    return this.supportTicketsService.reply(id, req.user.id, dto);
  }
}