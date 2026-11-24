import type { Metadata } from 'next';
import { ProfilePage } from '@/components/profile/ProfilePage';

export const metadata: Metadata = {
  title: 'Profile',
};

export default function ProfileRoute() {
  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <ProfilePage />
    </div>
  );
}