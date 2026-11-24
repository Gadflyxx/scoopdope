'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboardingStore } from '@/store/onboarding.store';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';

export default function OnboardingPage() {
  const { reset } = useOnboardingStore();
  const router = useRouter();
  const [checkingStatus, setCheckingStatus] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkOnboardingStatus = async () => {
      try {
        const response = await fetch('/api/users/me', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });

        if (response.ok) {
          const user = await response.json();
          if (user?.onboardingCompleted) {
            if (isMounted) {
              router.replace('/dashboard');
            }
            return;
          }
        }
      } catch {
        // If we cannot determine status, allow the user to proceed with onboarding.
      }

      if (isMounted) {
        reset();
        setCheckingStatus(false);
      }
    };

    checkOnboardingStatus();

    return () => {
      isMounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleComplete = async () => {
    try {
      await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ onboardingCompleted: true }),
      });
    } catch {
      // Even if persistence fails, continue to the dashboard so the user is not blocked.
    }

    router.push('/dashboard');
  };

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <OnboardingWizard onClose={handleComplete} />
    </div>
  );
}