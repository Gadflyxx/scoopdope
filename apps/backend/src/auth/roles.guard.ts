import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !user.role) {
      throw new ForbiddenException('User role is missing or invalid');
    }

    // Normalize role comparison to be case-consistent so that a user whose
    // role is stored as e.g. "instructor" is still authorized against a
    // required role of "INSTRUCTOR" (and vice versa). This ensures the
    // INSTRUCTOR role assigned on application approval grants access to
    // course creation endpoints regardless of casing.
    const userRole = String(user.role).trim().toUpperCase();
    const normalizedRequiredRoles = requiredRoles.map((role) =>
      String(role).trim().toUpperCase()
    );

    if (!normalizedRequiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        `User role "${user.role}" does not have access to this resource. Required roles: ${requiredRoles.join(', ')}`
      );
    }

    return true;
  }
}