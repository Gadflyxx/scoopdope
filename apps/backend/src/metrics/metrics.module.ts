import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';
import { MetricsAuthGuard } from './metrics-auth.guard';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
      guard: MetricsAuthGuard,
    }),
  ],
  providers: [MetricsService, MetricsAuthGuard],
  exports: [MetricsService],
})
export class MetricsModule {}