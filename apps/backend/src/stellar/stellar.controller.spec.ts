jest.mock('../auth/jwt-auth.guard', () => ({
  JwtAuthGuard: class {},
}));
jest.mock('../auth/roles.guard', () => ({
  RolesGuard: class {},
}));

import { HttpStatus } from '@nestjs/common';
import { StellarController } from './stellar.controller';
import { UserRateLimitGuard } from '../rate-limit/user-rate-limit.guard';
import { UserRateLimitService } from '../rate-limit/user-rate-limit.service';

function createContext(request: any, response: any) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => StellarController.prototype.getBalance,
    getClass: () => StellarController,
  } as any;
}

describe('StellarController', () => {
  const mockService = {
    getAccountBalance: jest.fn(),
    getTransactions: jest.fn(),
  };
  let controller: StellarController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new StellarController(mockService as any, {} as any);
  });

  it('getBalance should return account balances', async () => {
    const balances = [{ asset_type: 'native', balance: '50' }];
    mockService.getAccountBalance.mockResolvedValue(balances);

    await expect(controller.getBalance('GABC')).resolves.toEqual(balances);
    expect(mockService.getAccountBalance).toHaveBeenCalledWith('GABC');
  });

  it('limits the balance endpoint to 30 requests per user per minute', async () => {
    const values = new Map<string, unknown>();
    const cache = {
      get: jest.fn((key: string) => Promise.resolve(values.get(key))),
      set: jest.fn((key: string, value: unknown) => {
        values.set(key, value);
        return Promise.resolve();
      }),
      del: jest.fn(),
    };
    const rateLimitService = new UserRateLimitService(cache as any);
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({ limit: 30, windowMs: 60000 }),
    };
    const guard = new UserRateLimitGuard(
      rateLimitService,
      reflector as any,
      { verify: jest.fn() } as any,
    );

    const request = { user: { id: 'user-1', role: 'student' }, ip: '127.0.0.1', headers: {} };
    const response = { set: jest.fn() };
    const context = createContext(request, response);

    for (let i = 0; i < 30; i += 1) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(response.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('getTransactions should return transactions with default limit', async () => {
    const txs = [{ id: '1', hash: 'abc123', createdAt: '2024-01-01T00:00:00Z', operationCount: 1, successful: true, feeCharged: '100' }];
    mockService.getTransactions.mockResolvedValue(txs);

    await expect(controller.getTransactions('GABC')).resolves.toEqual(txs);
    expect(mockService.getTransactions).toHaveBeenCalledWith('GABC', 10);
  });

  it('getTransactions should pass custom limit', async () => {
    mockService.getTransactions.mockResolvedValue([]);

    await controller.getTransactions('GABC', '5');
    expect(mockService.getTransactions).toHaveBeenCalledWith('GABC', 5);
  });
});
