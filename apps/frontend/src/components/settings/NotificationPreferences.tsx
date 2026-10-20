import { useEffect, useState } from 'react';

interface NotificationPreference {
  type: string;
  label: string;
  description: string;
  email: boolean;
  push: boolean;
  inApp: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreference[] = [
  {
    type: 'comments',
    label: 'Comments',
    description: 'When someone comments on your content',
    email: true,
    push: true,
    inApp: true,
  },
  {
    type: 'mentions',
    label: 'Mentions',
    description: 'When someone mentions you',
    email: true,
    push: true,
    inApp: true,
  },
  {
    type: 'follows',
    label: 'New followers',
    description: 'When someone starts following you',
    email: false,
    push: true,
    inApp: true,
  },
  {
    type: 'updates',
    label: 'Product updates',
    description: 'News and announcements about the product',
    email: true,
    push: false,
    inApp: false,
  },
];

const CHANNELS: Array<{ key: keyof Pick<NotificationPreference, 'email' | 'push' | 'inApp'>; label: string }> = [
  { key: 'email', label: 'Email' },
  { key: 'push', label: 'Push' },
  { key: 'inApp', label: 'In-app' },
];

export default function NotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreference[]>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      try {
        const response = await fetch('/api/notification-preferences');
        if (!response.ok) {
          throw new Error('Failed to load notification preferences');
        }
        const data = await response.json();
        if (!cancelled && Array.isArray(data.preferences)) {
          setPreferences(data.preferences);
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

  function togglePreference(type: string, channel: 'email' | 'push' | 'inApp') {
    setSaved(false);
    setPreferences((current) =>
      current.map((preference) =>
        preference.type === type ? { ...preference, [channel]: !preference[channel] } : preference,
      ),
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch('/api/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences }),
      });

      if (!response.ok) {
        throw new Error('Failed to save notification preferences');
      }

      const data = await response.json();
      if (Array.isArray(data.preferences)) {
        setPreferences(data.preferences);
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notification preferences');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p>Loading notification preferences…</p>;
  }

  return (
    <section aria-labelledby="notification-preferences-heading">
      <h2 id="notification-preferences-heading">Notification preferences</h2>
      <p>Choose which notifications you receive and how you receive them.</p>

      {error && <p role="alert">{error}</p>}

      <table>
        <thead>
          <tr>
            <th scope="col">Notification</th>
            {CHANNELS.map((channel) => (
              <th key={channel.key} scope="col">
                {channel.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preferences.map((preference) => (
            <tr key={preference.type}>
              <th scope="row">
                <span>{preference.label}</span>
                <small>{preference.description}</small>
              </th>
              {CHANNELS.map((channel) => (
                <td key={channel.key}>
                  <input
                    type="checkbox"
                    checked={preference[channel.key]}
                    onChange={() => togglePreference(preference.type, channel.key)}
                    aria-label={`${preference.label} via ${channel.label}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save preferences'}
      </button>

      {saved && <p role="status">Your notification preferences have been saved.</p>}
    </section>
  );
}
