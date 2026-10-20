'use client';

import { useEffect, useState } from 'react';

type NotificationChannel = 'email' | 'push' | 'inApp';

type NotificationType =
  | 'mentions'
  | 'comments'
  | 'follows'
  | 'systemUpdates'
  | 'marketing';

type NotificationPreferences = Record<NotificationType, Record<NotificationChannel, boolean>>;

const CHANNELS: { key: NotificationChannel; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'push', label: 'Push' },
  { key: 'inApp', label: 'In-app' },
];

const TYPES: { key: NotificationType; label: string; description: string }[] = [
  { key: 'mentions', label: 'Mentions', description: 'When someone mentions you.' },
  { key: 'comments', label: 'Comments', description: 'Replies and comments on your content.' },
  { key: 'follows', label: 'Follows', description: 'When someone follows you.' },
  { key: 'systemUpdates', label: 'System updates', description: 'Important account and security notices.' },
  { key: 'marketing', label: 'Product news', description: 'Tips, announcements, and offers.' },
];

const DEFAULT_PREFERENCES: NotificationPreferences = TYPES.reduce((acc, type) => {
  acc[type.key] = CHANNELS.reduce((channelAcc, channel) => {
    channelAcc[channel.key] = true;
    return channelAcc;
  }, {} as Record<NotificationChannel, boolean>);
  return acc;
}, {} as NotificationPreferences);

export default function NotificationPreferencesPage() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      try {
        const response = await fetch('/api/users/me/notification-preferences');
        if (!response.ok) {
          throw new Error('Failed to load notification preferences');
        }
        const data = (await response.json()) as Partial<NotificationPreferences>;
        if (!cancelled) {
          setPreferences({ ...DEFAULT_PREFERENCES, ...data });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load notification preferences');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPreferences();

    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(type: NotificationType, channel: NotificationChannel) {
    setSaved(false);
    setPreferences((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [channel]: !prev[type][channel],
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch('/api/users/me/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });

      if (!response.ok) {
        throw new Error('Failed to save notification preferences');
      }

      const data = (await response.json()) as Partial<NotificationPreferences>;
      setPreferences({ ...DEFAULT_PREFERENCES, ...data });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notification preferences');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Notification preferences</h1>
      <p className="mt-2 text-sm text-gray-600">
        Choose how you want to be notified for each type of activity.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Loading preferences…</p>
      ) : (
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="border-b py-2 pr-4 font-medium">Notification</th>
                {CHANNELS.map((channel) => (
                  <th key={channel.key} className="border-b py-2 px-4 font-medium">
                    {channel.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TYPES.map((type) => (
                <tr key={type.key}>
                  <td className="border-b py-3 pr-4">
                    <div className="font-medium">{type.label}</div>
                    <div className="text-xs text-gray-500">{type.description}</div>
                  </td>
                  {CHANNELS.map((channel) => (
                    <td key={channel.key} className="border-b py-3 px-4">
                      <input
                        type="checkbox"
                        aria-label={`${type.label} via ${channel.label}`}
                        checked={preferences[type.key][channel.key]}
                        onChange={() => toggle(type.key, channel.key)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          {saved ? <p className="mt-4 text-sm text-green-600">Preferences saved.</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="mt-6 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save preferences'}
          </button>
        </form>
      )}
    </main>
  );
}
