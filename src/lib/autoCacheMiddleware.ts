// src/lib/autoCacheMiddleware.ts
// Part 22 — Auto-cache middleware.
//
// This module exposes one function per content type that is called
// automatically when content generation completes (from hooks).
// It checks the autoCache setting and calls cacheStorage if enabled.
//
// Each function is intentionally non-throwing — a cache failure should
// never break the main feature flow.

import { isAutoCacheEnabled } from './cacheSettings';
import {
  cacheReport,
  cachePodcast,
  cacheDebate,
  cacheAcademicPaper,
  cachePresentation,
} from './cacheStorage';
import type { ResearchReport, Podcast, DebateSession, AcademicPaper, GeneratedPresentation } from '../types';

// ─── Report ───────────────────────────────────────────────────────────────────

export async function autoCacheReport(report: ResearchReport): Promise<void> {
  try {
    const enabled = await isAutoCacheEnabled();
    if (!enabled) return;
    await cacheReport({
      ...report,
      title: report.title ?? report.query,
    } as any);
  } catch (err) {
    console.warn('[AutoCache] report cache error:', err);
  }
}

// ─── Podcast ──────────────────────────────────────────────────────────────────

export async function autoCachePodcast(podcast: Podcast): Promise<void> {
  try {
    const enabled = await isAutoCacheEnabled();
    if (!enabled) return;
    if (podcast.status !== 'completed') return;
    await cachePodcast(podcast as any);
  } catch (err) {
    console.warn('[AutoCache] podcast cache error:', err);
  }
}

// ─── Debate ───────────────────────────────────────────────────────────────────

export async function autoCacheDebate(session: DebateSession): Promise<void> {
  try {
    const enabled = await isAutoCacheEnabled();
    if (!enabled) return;
    if (session.status !== 'completed') return;
    await cacheDebate({
      ...session,
      topic: session.topic,
    } as any);
  } catch (err) {
    console.warn('[AutoCache] debate cache error:', err);
  }
}

// ─── Academic Paper ───────────────────────────────────────────────────────────

export async function autoCacheAcademicPaper(paper: AcademicPaper): Promise<void> {
  try {
    const enabled = await isAutoCacheEnabled();
    if (!enabled) return;
    await cacheAcademicPaper(paper as any);
  } catch (err) {
    console.warn('[AutoCache] academic paper cache error:', err);
  }
}

// ─── Presentation ─────────────────────────────────────────────────────────────

export async function autoCachePresentation(presentation: GeneratedPresentation): Promise<void> {
  try {
    const enabled = await isAutoCacheEnabled();
    if (!enabled) return;
    await cachePresentation(presentation as any);
  } catch (err) {
    console.warn('[AutoCache] presentation cache error:', err);
  }
}