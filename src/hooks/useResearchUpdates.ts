// src/hooks/useResearchUpdates.ts
// Manages saved topics for research update notifications.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SavedTopic } from '../types';
import { useAuth } from '../context/AuthContext';
import { scheduleTopicUpdateNotification } from '../lib/notifications';

export function useResearchUpdates() {
  const { user } = useAuth();
  const [savedTopics, setSavedTopics] = useState<SavedTopic[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTopics = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('saved_topics')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSavedTopics((data ?? []).map(mapRow));
    } catch (err) {
      console.error('[useResearchUpdates] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  const saveTopic = useCallback(async (topic: string): Promise<void> => {
    if (!user) return;
    const { data, error } = await supabase
      .from('saved_topics')
      .insert({ user_id: user.id, topic, notify_on_update: true })
      .select()
      .single();
    if (!error && data) {
      setSavedTopics((prev) => [mapRow(data), ...prev]);
    }
  }, [user]);

  const removeTopic = useCallback(async (topicId: string): Promise<void> => {
    await supabase.from('saved_topics').delete().eq('id', topicId);
    setSavedTopics((prev) => prev.filter((t) => t.id !== topicId));
  }, []);

  const toggleNotification = useCallback(async (topicId: string): Promise<void> => {
    const topic = savedTopics.find((t) => t.id === topicId);
    if (!topic) return;
    const newVal = !topic.notifyOnUpdate;
    await supabase
      .from('saved_topics')
      .update({ notify_on_update: newVal })
      .eq('id', topicId);
    setSavedTopics((prev) =>
      prev.map((t) => t.id === topicId ? { ...t, notifyOnUpdate: newVal } : t)
    );
  }, [savedTopics]);

  // Simulates checking for new research on saved topics
  const checkForUpdates = useCallback(async (): Promise<number> => {
    if (!user || savedTopics.length === 0) return 0;
    // In a real app this would call a backend job.
    // Here we simulate a notification for demo purposes.
    const notifyTopics = savedTopics.filter((t) => t.notifyOnUpdate);
    let count = 0;
    for (const topic of notifyTopics.slice(0, 1)) {
      await scheduleTopicUpdateNotification(topic.topic);
      count++;
    }
    return count;
  }, [user, savedTopics]);

  return {
    savedTopics, loading,
    saveTopic, removeTopic, toggleNotification,
    checkForUpdates, refetch: fetchTopics,
  };
}

function mapRow(row: any): SavedTopic {
  return {
    id: row.id,
    userId: row.user_id,
    topic: row.topic,
    lastCheckedAt: row.last_checked_at,
    notifyOnUpdate: row.notify_on_update,
    createdAt: row.created_at,
  };
}