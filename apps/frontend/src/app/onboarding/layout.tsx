import type { Metadata } from 'next';
import { OnboardingAuthGuard } from './OnboardingAuthGuard';

export const metadata: Metadata = {
  title: 'Onboarding',
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingAuthGuard>
      <div className="min-h-screen w-full bg-background">
        <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </OnboardingAuthGuard>
  );
}