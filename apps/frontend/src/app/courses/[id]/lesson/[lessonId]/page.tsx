'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { TranscriptDisplay } from '@/components/courses/TranscriptDisplay';
import { NotesPanel } from '@/components/courses/NotesPanel';
import { ProgressTracker } from '@/components/courses/ProgressTracker';
import { ChevronLeft, ChevronRight, Layout, BookOpen, TrendingUp, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useVideoShortcuts } from '@/hooks/useVideoShortcuts';
import { useSyncProgress } from '@/hooks/useSyncProgress';

export default function LessonPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params?.id;
  const lessonId = params?.lessonId;

  const [lesson, setLesson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [sidebarTab, setSidebarTab] = useState<'transcript' | 'notes' | 'progress'>('transcript');
  const [isCompleting, setIsCompleting] = useState(false);
  const [resources, setResources] = useState<any[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isExportingNotes, setIsExportingNotes] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { recordProgress } = useSyncProgress();

  useVideoShortcuts(videoRef);

  useEffect(() => {
    if (!lessonId) return;
    api.get(`/lessons/${lessonId}`)
      .then(({ data }) => setLesson(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lessonId]);

  useEffect(() => {
    if (!lessonId) return;
    api.get(`/lessons/${lessonId}/resources`)
      .then(({ data }) => setResources(Array.isArray(data) ? data : data?.resources ?? []))
      .catch(() => setResources([]));
  }, [lessonId]);

  const handleDownloadResource = async (resource: any) => {
    if (!lessonId || !resource?.id) return;
    setDownloadingId(resource.id);
    try {
      const { data } = await api.get(
        `/lessons/${lessonId}/resources/${resource.id}/download`
      );
      const url = data?.url ?? data?.signedUrl ?? data?.downloadUrl;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('Failed to download resource:', error);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleExportNotes = async () => {
    if (!courseId) return;
    setIsExportingNotes(true);
    try {
      const response = await api.get(`/courses/${courseId}/notes/export`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `course-${courseId}-notes.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export notes:', error);
    } finally {
      setIsExportingNotes(false);
    }
  };

  // Study session heartbeat: start a session, then heartbeat every 30s while the tab is visible.
  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;

    const sendHeartbeat = () => {
      if (!sessionIdRef.current) return;
      api
        .post('/lesson-tracking/sessions/heartbeat', {
          sessionId: sessionIdRef.current,
          lessonId,
        })
        .catch(() => {});
    };

    const startHeartbeat = () => {
      if (heartbeatIntervalRef.current) return;
      heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000);
    };

    const stopHeartbeat = () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
        startHeartbeat();
      } else {
        stopHeartbeat();
      }
    };

    const endSession = () => {
      if (!sessionIdRef.current) return;
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      stopHeartbeat();
      try {
        const payload = JSON.stringify({ sessionId, lessonId });
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon(
            '/api/lesson-tracking/sessions/end',
            new Blob([payload], { type: 'application/json' })
          );
        } else {
          api.post('/lesson-tracking/sessions/end', { sessionId, lessonId }).catch(() => {});
        }
      } catch {
        // best-effort
      }
    };

    const handleBeforeUnload = () => {
      endSession();
    };

    api
      .post('/lesson-tracking/sessions/start', { lessonId })
      .then(({ data }) => {
        if (cancelled) return;
        sessionIdRef.current = data?.id ?? data?.sessionId ?? null;
        if (document.visibilityState === 'visible') {
          sendHeartbeat();
          startHeartbeat();
        }
      })
      .catch(() => {});

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      endSession();
    };
  }, [lessonId]);

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  const handleComplete = async () => {
    if (!courseId || !lessonId) return;
    setIsCompleting(true);
    try {
      await recordProgress(courseId, lessonId, 100);
      setLesson((prev: any) => ({ ...prev, completed: true }));
    } catch (error) {
      console.error('Failed to mark lesson as complete:', error);
    } finally {
      setIsCompleting(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading lesson...</div>;
  if (!lesson) return <div className="p-8 text-center">Lesson not found.</div>;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/courses/${courseId}`)}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Course
          </Button>
          <h1 className="text-lg font-bold">{lesson.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm"><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm"><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
              {lesson.videoUrl ? (
                <video
                  ref={videoRef}
                  src={lesson.videoUrl}
                  className="w-full h-full"
                  controls
                  onTimeUpdate={handleTimeUpdate}
                  aria-label="Lesson video. Use Space or K to play/pause, arrow keys or J/L to seek, up/down to adjust volume, M to mute, F for fullscreen."
                  data-testid="video-player"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  No video available for this lesson.
                </div>
              )}
            </div>
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">About this lesson</h2>
              <div className="prose dark:prose-invert max-w-none text-base leading-relaxed text-gray-700 dark:text-gray-300">
                {lesson.content}
              </div>
            </div>

            {resources.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-2xl font-bold">Downloadable Resources</h2>
                <ul className="divide-y divide-gray-200 dark:divide-gray-800 rounded-xl border dark:border-gray-800 bg-white dark:bg-gray-900">
                  {resources.map((resource: any) => (
                    <li
                      key={resource.id}
                      className="flex items-center justify-between gap-4 p-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{resource.filename}</p>
                          {typeof resource.sizeBytes === 'number' && (
                            <p className="text-xs text-gray-500">
                              {(resource.sizeBytes / 1024).toFixed(1)} KB
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadResource(resource)}
                        disabled={downloadingId === resource.id}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {downloadingId === resource.id ? 'Preparing...' : 'Download'}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-96 bg-white dark:bg-gray-900 border-t lg:border-t-0 lg:border-l dark:border-gray-800 flex flex-col h-[50vh] lg:h-auto">
          {/* Tab bar */}
          <div className="flex border-b dark:border-gray-800">
            <button
              onClick={() => setSidebarTab('transcript')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium border-b-2 transition-colors ${
                sidebarTab === 'transcript'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Layout className="w-4 h-4" /> Transcript
            </button>
            <button
              onClick={() => setSidebarTab('notes')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium border-b-2 transition-colors ${
                sidebarTab === 'notes'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <BookOpen className="w-4 h-4" /> Notes
            </button>
            <button
              onClick={() => setSidebarTab('progress')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium border-b-2 transition-colors ${
                sidebarTab === 'progress'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <TrendingUp className="w-4 h-4" /> Progress
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {sidebarTab === 'transcript' ? (
              <TranscriptDisplay
                lessonId={lessonId as string}
                currentTime={currentTime}
                onSeek={handleSeek}
              />
            ) : sidebarTab === 'notes' ? (
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-hidden">
                  <NotesPanel
                    lessonId={lessonId as string}
                    lessonTitle={lesson.title}
                    currentTime={currentTime}
                    onSeek={handleSeek}
                  />
                </div>
                <div className="p-3 border-t dark:border-gray-800">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleExportNotes}
                    disabled={isExportingNotes}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {isExportingNotes ? 'Exporting...' : 'Export notes as PDF'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-4 overflow-y-auto h-full">
                <ProgressTracker
                  courseId={courseId as string}
                  compact
                />
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
