import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = request.method;
    const route = request.route?.path || request.url;
    const startTime = Date.now();

    // Skip recording metrics for the /metrics scrape endpoint itself to avoid
    // polluting the registry with self-referential scrape traffic.
    if (this.isMetricsEndpoint(request)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          this.recordRequest(method, route, response.statusCode, startTime);
        },
        error: (err) => {
          const statusCode = err?.status || err?.statusCode || response.statusCode || 500;
          this.recordRequest(method, route, statusCode, startTime);
        },
      }),
    );
  }

  private isMetricsEndpoint(request: any): boolean {
    const path: string = request.route?.path || request.url || '';
    return path === '/metrics' || path.startsWith('/metrics?');
  }

  private recordRequest(method: string, route: string, statusCode: number, startTime: number): void {
    const durationSeconds = (Date.now() - startTime) / 1000;

    this.metricsService.incrementHttpRequests(method, route, statusCode);
    this.metricsService.observeHttpRequestDuration(method, route, statusCode, durationSeconds);
  }
}