import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class IpAllowlistGuard implements CanActivate {
  private readonly logger = new Logger(IpAllowlistGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const clientIp = this.resolveClientIp(request);
    const allowlist = this.parseAllowlist();

    if (allowlist.length === 0) {
      this.logger.warn(
        `ADMIN_ALLOWED_IPS is empty; denying admin request from ${clientIp} (fail closed)`,
      );
      throw new ForbiddenException('Access denied');
    }

    if (!clientIp || !allowlist.includes(clientIp)) {
      this.logger.warn(
        `Denied admin request from unlisted IP: ${clientIp ?? 'unknown'}`,
      );
      throw new ForbiddenException('Access denied');
    }

    return true;
  }

  private parseAllowlist(): string[] {
    const raw = this.configService.get<string>('ADMIN_ALLOWED_IPS') ?? '';
    return raw
      .split(',')
      .map((entry) => this.normalizeIp(entry.trim()))
      .filter((entry) => entry.length > 0);
  }

  private resolveClientIp(request: Request): string | null {
    // When behind a trusted proxy, Express populates req.ips with the
    // X-Forwarded-For chain (leftmost = original client). Prefer that.
    const ips = (request as Request & { ips?: string[] }).ips;
    if (Array.isArray(ips) && ips.length > 0) {
      return this.normalizeIp(ips[0]);
    }

    if (request.ip) {
      return this.normalizeIp(request.ip);
    }

    const socketIp = request.socket?.remoteAddress;
    if (socketIp) {
      return this.normalizeIp(socketIp);
    }

    return null;
  }

  private normalizeIp(ip: string | undefined | null): string {
    if (!ip) {
      return '';
    }

    let normalized = ip.trim();

    // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:192.168.1.1 -> 192.168.1.1)
    const mappedPrefix = '::ffff:';
    if (normalized.toLowerCase().startsWith(mappedPrefix)) {
      normalized = normalized.slice(mappedPrefix.length);
    }

    // Strip surrounding brackets for IPv6 literals (e.g. [::1] -> ::1)
    if (normalized.startsWith('[') && normalized.endsWith(']')) {
      normalized = normalized.slice(1, -1);
    }

    // Strip zone identifier (e.g. fe80::1%eth0 -> fe80::1)
    const zoneIndex = normalized.indexOf('%');
    if (zoneIndex !== -1) {
      normalized = normalized.slice(0, zoneIndex);
    }

    return normalized.toLowerCase();
  }
}