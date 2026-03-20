// src/services/sourceTrustScorer.ts
// Part 25 — Source Trust Scoring System
//
// Pure calculation service — zero API calls, zero side effects.
// Scores any web URL for credibility, bias, and trust tier using a
// hand-curated domain database cross-referenced against:
//   • Ad Fontes Media Bias Chart methodology
//   • Media Bias/Fact Check 2025 taxonomy
//   • AllSides Media Bias Ratings
//
// Usage:
//   import { scoreSource, rankByTrust, getTierColor, getBiasLabel } from './sourceTrustScorer';
//   const trust = scoreSource('https://reuters.com/article/...');
//   // trust.credibilityScore → 9.2, trust.bias → 'center', trust.tier → 2

import { SourceBias, SourceTrustScore, SourceTrustTier } from '../types';

// ─── Domain Entry ─────────────────────────────────────────────────────────────

interface DomainEntry {
  tier:        SourceTrustTier;
  category:    string;
  baseScore:   number;   // 0–10
  bias:        SourceBias;
  authority:   number;   // 0–100 estimated DA
  tags:        string[];
}

// ─── Domain Trust Database ────────────────────────────────────────────────────
// ~120 curated domains covering the most common research sources.
// Scores informed by Ad Fontes, MBFC, and AllSides data.

const DOMAIN_DB: Record<string, DomainEntry> = {

  // ── Tier 1: Academic ────────────────────────────────────────────────────────
  'arxiv.org':                       { tier: 1, category: 'academic', baseScore: 9.7, bias: 'academic', authority: 91, tags: ['academic', 'preprint', 'science', 'open-access'] },
  'pubmed.ncbi.nlm.nih.gov':         { tier: 1, category: 'academic', baseScore: 9.9, bias: 'academic', authority: 94, tags: ['academic', 'medical', 'peer-reviewed', 'government'] },
  'ncbi.nlm.nih.gov':                { tier: 1, category: 'academic', baseScore: 9.9, bias: 'academic', authority: 94, tags: ['academic', 'medical', 'peer-reviewed', 'government'] },
  'scholar.google.com':              { tier: 1, category: 'academic', baseScore: 9.5, bias: 'academic', authority: 95, tags: ['academic', 'aggregator'] },
  'researchgate.net':                { tier: 1, category: 'academic', baseScore: 9.0, bias: 'academic', authority: 90, tags: ['academic', 'peer-reviewed'] },
  'semanticscholar.org':             { tier: 1, category: 'academic', baseScore: 9.2, bias: 'academic', authority: 88, tags: ['academic', 'ai-powered'] },
  'jstor.org':                       { tier: 1, category: 'academic', baseScore: 9.3, bias: 'academic', authority: 87, tags: ['academic', 'peer-reviewed', 'humanities'] },
  'nature.com':                      { tier: 1, category: 'academic', baseScore: 9.8, bias: 'academic', authority: 93, tags: ['academic', 'peer-reviewed', 'science'] },
  'science.org':                     { tier: 1, category: 'academic', baseScore: 9.8, bias: 'academic', authority: 92, tags: ['academic', 'peer-reviewed', 'science'] },
  'thelancet.com':                   { tier: 1, category: 'academic', baseScore: 9.7, bias: 'academic', authority: 91, tags: ['academic', 'medical', 'peer-reviewed'] },
  'bmj.com':                         { tier: 1, category: 'academic', baseScore: 9.7, bias: 'academic', authority: 90, tags: ['academic', 'medical', 'peer-reviewed'] },
  'nejm.org':                        { tier: 1, category: 'academic', baseScore: 9.8, bias: 'academic', authority: 92, tags: ['academic', 'medical', 'peer-reviewed'] },
  'ieee.org':                        { tier: 1, category: 'academic', baseScore: 9.5, bias: 'technical', authority: 90, tags: ['academic', 'engineering', 'technical', 'peer-reviewed'] },
  'ieeexplore.ieee.org':             { tier: 1, category: 'academic', baseScore: 9.5, bias: 'technical', authority: 90, tags: ['academic', 'engineering', 'technical', 'peer-reviewed'] },
  'acm.org':                         { tier: 1, category: 'academic', baseScore: 9.4, bias: 'technical', authority: 89, tags: ['academic', 'computing', 'peer-reviewed'] },
  'dl.acm.org':                      { tier: 1, category: 'academic', baseScore: 9.4, bias: 'technical', authority: 89, tags: ['academic', 'computing', 'peer-reviewed'] },
  'springer.com':                    { tier: 1, category: 'academic', baseScore: 9.1, bias: 'academic', authority: 88, tags: ['academic', 'publisher', 'peer-reviewed'] },
  'link.springer.com':               { tier: 1, category: 'academic', baseScore: 9.1, bias: 'academic', authority: 88, tags: ['academic', 'publisher', 'peer-reviewed'] },
  'sciencedirect.com':               { tier: 1, category: 'academic', baseScore: 9.2, bias: 'academic', authority: 89, tags: ['academic', 'publisher', 'peer-reviewed'] },
  'wiley.com':                       { tier: 1, category: 'academic', baseScore: 9.0, bias: 'academic', authority: 87, tags: ['academic', 'publisher', 'peer-reviewed'] },
  'plos.org':                        { tier: 1, category: 'academic', baseScore: 9.0, bias: 'academic', authority: 86, tags: ['academic', 'open-access', 'peer-reviewed'] },
  'cell.com':                        { tier: 1, category: 'academic', baseScore: 9.6, bias: 'academic', authority: 89, tags: ['academic', 'biology', 'peer-reviewed'] },
  'pnas.org':                        { tier: 1, category: 'academic', baseScore: 9.7, bias: 'academic', authority: 91, tags: ['academic', 'science', 'peer-reviewed'] },

  // ── Tier 1: Government & International Orgs ─────────────────────────────────
  'who.int':                         { tier: 1, category: 'government', baseScore: 9.3, bias: 'government', authority: 93, tags: ['government', 'health', 'international', 'official'] },
  'worldbank.org':                   { tier: 1, category: 'government', baseScore: 9.2, bias: 'government', authority: 92, tags: ['government', 'economics', 'international', 'official'] },
  'imf.org':                         { tier: 1, category: 'government', baseScore: 9.2, bias: 'financial', authority: 91, tags: ['government', 'economics', 'financial', 'official'] },
  'un.org':                          { tier: 1, category: 'government', baseScore: 9.0, bias: 'government', authority: 92, tags: ['government', 'international', 'official'] },
  'oecd.org':                        { tier: 1, category: 'government', baseScore: 9.1, bias: 'government', authority: 91, tags: ['government', 'economics', 'international', 'official'] },
  'ec.europa.eu':                    { tier: 1, category: 'government', baseScore: 9.0, bias: 'government', authority: 90, tags: ['government', 'european', 'official'] },
  'europa.eu':                       { tier: 1, category: 'government', baseScore: 9.0, bias: 'government', authority: 90, tags: ['government', 'european', 'official'] },
  'wto.org':                         { tier: 1, category: 'government', baseScore: 9.0, bias: 'government', authority: 89, tags: ['government', 'trade', 'international', 'official'] },
  'data.worldbank.org':              { tier: 1, category: 'government', baseScore: 9.3, bias: 'government', authority: 91, tags: ['government', 'data', 'economics', 'official'] },
  'cdc.gov':                         { tier: 1, category: 'government', baseScore: 9.5, bias: 'government', authority: 92, tags: ['government', 'health', 'official'] },
  'nih.gov':                         { tier: 1, category: 'government', baseScore: 9.5, bias: 'government', authority: 93, tags: ['government', 'medical', 'research', 'official'] },
  'bls.gov':                         { tier: 1, category: 'government', baseScore: 9.4, bias: 'government', authority: 89, tags: ['government', 'statistics', 'labor', 'official'] },
  'census.gov':                      { tier: 1, category: 'government', baseScore: 9.4, bias: 'government', authority: 90, tags: ['government', 'statistics', 'official'] },
  'nasa.gov':                        { tier: 1, category: 'government', baseScore: 9.5, bias: 'government', authority: 93, tags: ['government', 'science', 'space', 'official'] },
  'sec.gov':                         { tier: 1, category: 'government', baseScore: 9.3, bias: 'government', authority: 88, tags: ['government', 'financial', 'regulatory', 'official'] },
  'fed.gov':                         { tier: 1, category: 'government', baseScore: 9.3, bias: 'government', authority: 88, tags: ['government', 'financial', 'official'] },
  'federalreserve.gov':              { tier: 1, category: 'government', baseScore: 9.4, bias: 'financial', authority: 90, tags: ['government', 'financial', 'monetary', 'official'] },
  'ecb.europa.eu':                   { tier: 1, category: 'government', baseScore: 9.2, bias: 'financial', authority: 88, tags: ['government', 'financial', 'european', 'official'] },
  'statista.com':                    { tier: 1, category: 'research', baseScore: 8.7, bias: 'center', authority: 88, tags: ['statistics', 'data', 'research', 'aggregator'] },

  // ── Tier 2: Major News — Center ─────────────────────────────────────────────
  'reuters.com':                     { tier: 2, category: 'major-news', baseScore: 9.2, bias: 'center', authority: 93, tags: ['news', 'wire', 'international', 'factual'] },
  'apnews.com':                      { tier: 2, category: 'major-news', baseScore: 9.2, bias: 'center', authority: 91, tags: ['news', 'wire', 'factual'] },
  'bbc.com':                         { tier: 2, category: 'major-news', baseScore: 8.9, bias: 'center', authority: 95, tags: ['news', 'international', 'broadcast'] },
  'bbc.co.uk':                       { tier: 2, category: 'major-news', baseScore: 8.9, bias: 'center', authority: 95, tags: ['news', 'international', 'broadcast'] },
  'npr.org':                         { tier: 2, category: 'major-news', baseScore: 8.7, bias: 'center', authority: 89, tags: ['news', 'public-radio', 'factual'] },
  'pbs.org':                         { tier: 2, category: 'major-news', baseScore: 8.6, bias: 'center', authority: 87, tags: ['news', 'public-television', 'factual'] },
  'axios.com':                       { tier: 2, category: 'major-news', baseScore: 8.3, bias: 'center', authority: 85, tags: ['news', 'factual', 'concise'] },
  'csmonitor.com':                   { tier: 2, category: 'major-news', baseScore: 8.5, bias: 'center', authority: 84, tags: ['news', 'international', 'factual'] },
  'usafacts.org':                    { tier: 2, category: 'major-news', baseScore: 9.0, bias: 'center', authority: 82, tags: ['data', 'statistics', 'nonpartisan', 'factual'] },

  // ── Tier 2: Major News — Center-Left ────────────────────────────────────────
  'nytimes.com':                     { tier: 2, category: 'major-news', baseScore: 8.6, bias: 'center-left', authority: 95, tags: ['news', 'newspaper', 'international'] },
  'washingtonpost.com':              { tier: 2, category: 'major-news', baseScore: 8.5, bias: 'center-left', authority: 93, tags: ['news', 'newspaper', 'politics'] },
  'theguardian.com':                 { tier: 2, category: 'major-news', baseScore: 8.4, bias: 'center-left', authority: 94, tags: ['news', 'newspaper', 'international'] },
  'guardian.com':                    { tier: 2, category: 'major-news', baseScore: 8.4, bias: 'center-left', authority: 94, tags: ['news', 'newspaper', 'international'] },
  'cnn.com':                         { tier: 2, category: 'major-news', baseScore: 7.8, bias: 'center-left', authority: 93, tags: ['news', 'broadcast', 'television'] },
  'theatlantic.com':                 { tier: 2, category: 'major-news', baseScore: 8.2, bias: 'center-left', authority: 88, tags: ['news', 'magazine', 'longform'] },
  'politico.com':                    { tier: 2, category: 'major-news', baseScore: 8.1, bias: 'center-left', authority: 88, tags: ['news', 'politics', 'policy'] },
  'vox.com':                         { tier: 2, category: 'major-news', baseScore: 7.7, bias: 'left', authority: 86, tags: ['news', 'explainer', 'opinion'] },

  // ── Tier 2: Major News — Center-Right / Financial ────────────────────────────
  'wsj.com':                         { tier: 2, category: 'major-news', baseScore: 8.6, bias: 'center-right', authority: 94, tags: ['news', 'financial', 'newspaper', 'business'] },
  'economist.com':                   { tier: 2, category: 'major-news', baseScore: 8.8, bias: 'center-right', authority: 92, tags: ['news', 'magazine', 'economics', 'international'] },
  'ft.com':                          { tier: 2, category: 'major-news', baseScore: 8.7, bias: 'financial', authority: 91, tags: ['news', 'financial', 'business', 'international'] },
  'bloomberg.com':                   { tier: 2, category: 'major-news', baseScore: 8.6, bias: 'financial', authority: 93, tags: ['news', 'financial', 'business', 'data'] },
  'time.com':                        { tier: 2, category: 'major-news', baseScore: 8.0, bias: 'center-left', authority: 90, tags: ['news', 'magazine', 'international'] },
  'newsweek.com':                    { tier: 2, category: 'major-news', baseScore: 7.5, bias: 'center', authority: 87, tags: ['news', 'magazine'] },
  'thehill.com':                     { tier: 2, category: 'major-news', baseScore: 7.8, bias: 'center', authority: 85, tags: ['news', 'politics', 'policy'] },
  'nationalgeographic.com':         { tier: 2, category: 'major-news', baseScore: 9.0, bias: 'center', authority: 91, tags: ['science', 'environment', 'geography', 'factual'] },
  'scientificamerican.com':          { tier: 2, category: 'major-news', baseScore: 9.0, bias: 'center', authority: 89, tags: ['science', 'factual', 'academic'] },
  'newscientist.com':                { tier: 2, category: 'major-news', baseScore: 8.8, bias: 'center', authority: 87, tags: ['science', 'technology', 'factual'] },
  'technologyreview.com':            { tier: 2, category: 'research', baseScore: 8.9, bias: 'technical', authority: 88, tags: ['technology', 'ai', 'research', 'mit'] },

  // ── Tier 2: Research & Advisory Firms ───────────────────────────────────────
  'mckinsey.com':                    { tier: 2, category: 'research', baseScore: 8.5, bias: 'financial', authority: 89, tags: ['consulting', 'research', 'business', 'strategy'] },
  'gartner.com':                     { tier: 2, category: 'research', baseScore: 8.4, bias: 'technical', authority: 87, tags: ['research', 'technology', 'market-research'] },
  'forrester.com':                   { tier: 2, category: 'research', baseScore: 8.2, bias: 'technical', authority: 84, tags: ['research', 'technology', 'market-research'] },
  'deloitte.com':                    { tier: 2, category: 'research', baseScore: 8.1, bias: 'financial', authority: 87, tags: ['consulting', 'research', 'business'] },
  'pwc.com':                         { tier: 2, category: 'research', baseScore: 8.0, bias: 'financial', authority: 86, tags: ['consulting', 'research', 'business'] },
  'bcg.com':                         { tier: 2, category: 'research', baseScore: 8.2, bias: 'financial', authority: 86, tags: ['consulting', 'research', 'strategy'] },
  'accenture.com':                   { tier: 2, category: 'research', baseScore: 7.8, bias: 'technical', authority: 87, tags: ['consulting', 'technology', 'research'] },
  'idc.com':                         { tier: 2, category: 'research', baseScore: 8.0, bias: 'technical', authority: 82, tags: ['research', 'technology', 'market-research'] },
  'grandviewresearch.com':           { tier: 2, category: 'research', baseScore: 7.5, bias: 'unknown', authority: 78, tags: ['market-research', 'statistics'] },
  'marketsandmarkets.com':           { tier: 2, category: 'research', baseScore: 7.4, bias: 'unknown', authority: 76, tags: ['market-research', 'statistics'] },
  'mordorintelligence.com':          { tier: 2, category: 'research', baseScore: 7.2, bias: 'unknown', authority: 73, tags: ['market-research'] },
  'ibisworld.com':                   { tier: 2, category: 'research', baseScore: 7.8, bias: 'unknown', authority: 80, tags: ['market-research', 'industry'] },

  // ── Tier 3: Tech News & Publications ────────────────────────────────────────
  'techcrunch.com':                  { tier: 3, category: 'tech-news', baseScore: 7.3, bias: 'technical', authority: 90, tags: ['technology', 'startups', 'venture-capital'] },
  'theverge.com':                    { tier: 3, category: 'tech-news', baseScore: 7.2, bias: 'technical', authority: 88, tags: ['technology', 'consumer-tech', 'reviews'] },
  'arstechnica.com':                 { tier: 3, category: 'tech-news', baseScore: 8.0, bias: 'technical', authority: 87, tags: ['technology', 'science', 'in-depth'] },
  'wired.com':                       { tier: 3, category: 'tech-news', baseScore: 7.8, bias: 'technical', authority: 89, tags: ['technology', 'science', 'culture'] },
  'engadget.com':                    { tier: 3, category: 'tech-news', baseScore: 7.0, bias: 'technical', authority: 87, tags: ['technology', 'consumer-tech', 'reviews'] },
  'venturebeat.com':                 { tier: 3, category: 'tech-news', baseScore: 7.0, bias: 'technical', authority: 84, tags: ['technology', 'ai', 'enterprise'] },
  'zdnet.com':                       { tier: 3, category: 'tech-news', baseScore: 6.8, bias: 'technical', authority: 85, tags: ['technology', 'enterprise', 'reviews'] },
  'cnet.com':                        { tier: 3, category: 'tech-news', baseScore: 6.7, bias: 'technical', authority: 87, tags: ['technology', 'consumer-tech', 'reviews'] },
  'tomsguide.com':                   { tier: 3, category: 'tech-news', baseScore: 6.5, bias: 'technical', authority: 82, tags: ['technology', 'consumer-tech', 'reviews'] },
  'pcmag.com':                       { tier: 3, category: 'tech-news', baseScore: 6.7, bias: 'technical', authority: 83, tags: ['technology', 'reviews', 'consumer-tech'] },
  'tomshardware.com':                { tier: 3, category: 'tech-news', baseScore: 7.0, bias: 'technical', authority: 82, tags: ['hardware', 'reviews', 'technical'] },
  'anandtech.com':                   { tier: 3, category: 'tech-news', baseScore: 7.5, bias: 'technical', authority: 80, tags: ['hardware', 'technical', 'in-depth'] },

  // ── Tier 3: Major Tech & AI Companies ────────────────────────────────────────
  'openai.com':                      { tier: 3, category: 'industry', baseScore: 7.5, bias: 'technical', authority: 90, tags: ['ai', 'research', 'primary-source', 'company'] },
  'anthropic.com':                   { tier: 3, category: 'industry', baseScore: 7.5, bias: 'technical', authority: 85, tags: ['ai', 'research', 'primary-source', 'company'] },
  'deepmind.com':                    { tier: 3, category: 'industry', baseScore: 8.0, bias: 'technical', authority: 87, tags: ['ai', 'research', 'academic', 'company'] },
  'research.google.com':             { tier: 3, category: 'industry', baseScore: 8.0, bias: 'technical', authority: 90, tags: ['ai', 'research', 'academic', 'company'] },
  'ai.meta.com':                     { tier: 3, category: 'industry', baseScore: 7.5, bias: 'technical', authority: 85, tags: ['ai', 'research', 'company'] },
  'microsoft.com':                   { tier: 3, category: 'industry', baseScore: 7.2, bias: 'technical', authority: 94, tags: ['technology', 'enterprise', 'primary-source', 'company'] },
  'google.com':                      { tier: 3, category: 'industry', baseScore: 7.0, bias: 'technical', authority: 99, tags: ['technology', 'primary-source', 'company'] },
  'amazon.com':                      { tier: 3, category: 'industry', baseScore: 6.5, bias: 'financial', authority: 97, tags: ['ecommerce', 'technology', 'primary-source', 'company'] },
  'aws.amazon.com':                  { tier: 3, category: 'industry', baseScore: 7.0, bias: 'technical', authority: 95, tags: ['cloud', 'technology', 'primary-source', 'company'] },
  'ibm.com':                         { tier: 3, category: 'industry', baseScore: 7.3, bias: 'technical', authority: 89, tags: ['technology', 'enterprise', 'research', 'company'] },
  'oracle.com':                      { tier: 3, category: 'industry', baseScore: 7.0, bias: 'technical', authority: 90, tags: ['technology', 'enterprise', 'company'] },
  'salesforce.com':                  { tier: 3, category: 'industry', baseScore: 7.0, bias: 'technical', authority: 89, tags: ['technology', 'enterprise', 'company'] },
  'github.com':                      { tier: 3, category: 'industry', baseScore: 7.5, bias: 'technical', authority: 97, tags: ['technology', 'code', 'primary-source'] },

  // ── Tier 3: Financial & Business ─────────────────────────────────────────────
  'investopedia.com':                { tier: 3, category: 'financial', baseScore: 7.2, bias: 'financial', authority: 86, tags: ['financial', 'education', 'definitions'] },
  'marketwatch.com':                 { tier: 3, category: 'financial', baseScore: 7.3, bias: 'financial', authority: 87, tags: ['financial', 'markets', 'news'] },
  'cnbc.com':                        { tier: 3, category: 'financial', baseScore: 7.5, bias: 'financial', authority: 90, tags: ['financial', 'business', 'television'] },
  'forbes.com':                      { tier: 3, category: 'financial', baseScore: 7.0, bias: 'center-right', authority: 92, tags: ['business', 'financial', 'opinion'] },
  'businessinsider.com':             { tier: 3, category: 'financial', baseScore: 6.8, bias: 'center-left', authority: 88, tags: ['business', 'technology', 'news'] },
  'fortune.com':                     { tier: 3, category: 'financial', baseScore: 7.4, bias: 'financial', authority: 87, tags: ['business', 'financial', 'magazine'] },
  'hbr.org':                         { tier: 3, category: 'research', baseScore: 8.2, bias: 'financial', authority: 87, tags: ['business', 'management', 'research', 'harvard'] },

  // ── Tier 3: General News ─────────────────────────────────────────────────────
  'foxnews.com':                     { tier: 3, category: 'news', baseScore: 6.2, bias: 'right', authority: 92, tags: ['news', 'television', 'opinion'] },
  'nypost.com':                      { tier: 3, category: 'news', baseScore: 5.8, bias: 'right', authority: 86, tags: ['news', 'tabloid', 'opinion'] },
  'usatoday.com':                    { tier: 3, category: 'news', baseScore: 7.2, bias: 'center', authority: 90, tags: ['news', 'newspaper'] },
  'nbcnews.com':                     { tier: 3, category: 'news', baseScore: 7.5, bias: 'center-left', authority: 89, tags: ['news', 'broadcast', 'television'] },
  'abcnews.go.com':                  { tier: 3, category: 'news', baseScore: 7.4, bias: 'center-left', authority: 90, tags: ['news', 'broadcast', 'television'] },
  'cbsnews.com':                     { tier: 3, category: 'news', baseScore: 7.3, bias: 'center-left', authority: 89, tags: ['news', 'broadcast', 'television'] },
  'huffpost.com':                    { tier: 3, category: 'news', baseScore: 6.5, bias: 'left', authority: 88, tags: ['news', 'opinion', 'aggregator'] },
  'theintercept.com':                { tier: 3, category: 'news', baseScore: 6.8, bias: 'left', authority: 82, tags: ['news', 'investigative', 'opinion'] },
  'vice.com':                        { tier: 3, category: 'news', baseScore: 6.2, bias: 'left', authority: 87, tags: ['news', 'culture', 'opinion'] },
  'slate.com':                       { tier: 3, category: 'news', baseScore: 6.5, bias: 'left', authority: 85, tags: ['news', 'magazine', 'opinion'] },
  'nationalreview.com':              { tier: 3, category: 'news', baseScore: 6.5, bias: 'right', authority: 82, tags: ['news', 'magazine', 'opinion', 'conservative'] },
  'breitbart.com':                   { tier: 3, category: 'news', baseScore: 4.5, bias: 'right', authority: 80, tags: ['news', 'opinion', 'partisan'] },

  // ── Tier 4: Blogs & Forums ───────────────────────────────────────────────────
  'medium.com':                      { tier: 4, category: 'blog', baseScore: 5.0, bias: 'unknown', authority: 94, tags: ['blog', 'opinion', 'user-generated'] },
  'substack.com':                    { tier: 4, category: 'blog', baseScore: 4.5, bias: 'unknown', authority: 88, tags: ['blog', 'newsletter', 'opinion'] },
  'reddit.com':                      { tier: 4, category: 'forum', baseScore: 3.5, bias: 'unknown', authority: 97, tags: ['forum', 'social', 'user-generated', 'community'] },
  'quora.com':                       { tier: 4, category: 'forum', baseScore: 3.8, bias: 'unknown', authority: 91, tags: ['forum', 'qa', 'user-generated'] },
  'stackexchange.com':               { tier: 4, category: 'forum', baseScore: 6.5, bias: 'technical', authority: 88, tags: ['forum', 'technical', 'community-reviewed'] },
  'stackoverflow.com':               { tier: 4, category: 'forum', baseScore: 7.0, bias: 'technical', authority: 94, tags: ['forum', 'technical', 'code', 'community-reviewed'] },
  'wikipedia.org':                   { tier: 3, category: 'wiki', baseScore: 7.5, bias: 'center', authority: 97, tags: ['encyclopedia', 'community-edited', 'aggregator'] },
  'en.wikipedia.org':                { tier: 3, category: 'wiki', baseScore: 7.5, bias: 'center', authority: 97, tags: ['encyclopedia', 'community-edited', 'aggregator'] },
};

// ─── TLD / Subdomain Trust Rules ─────────────────────────────────────────────
// Applied when a domain isn't in DOMAIN_DB but has a trusted TLD.

function getTLDBonus(hostname: string): Partial<DomainEntry> | null {
  if (hostname.endsWith('.gov'))    return { tier: 1, baseScore: 9.0, bias: 'government', authority: 85, tags: ['government', 'official'] };
  if (hostname.endsWith('.mil'))    return { tier: 1, baseScore: 8.8, bias: 'government', authority: 84, tags: ['government', 'military', 'official'] };
  if (hostname.endsWith('.edu'))    return { tier: 1, baseScore: 8.8, bias: 'academic',   authority: 83, tags: ['academic', 'university'] };
  if (hostname.endsWith('.ac.uk'))  return { tier: 1, baseScore: 8.7, bias: 'academic',   authority: 82, tags: ['academic', 'university', 'uk'] };
  if (hostname.endsWith('.ac.in'))  return { tier: 1, baseScore: 8.5, bias: 'academic',   authority: 78, tags: ['academic', 'university', 'india'] };
  if (hostname.endsWith('.int'))    return { tier: 1, baseScore: 9.0, bias: 'government', authority: 86, tags: ['international', 'official'] };
  return null;
}

// ─── Score Computation ────────────────────────────────────────────────────────

function extractHostname(url: string): string {
  try {
    // Handle URL strings that may not have a protocol
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return url.toLowerCase().replace(/^www\./, '');
  }
}

function lookupDomain(hostname: string): DomainEntry | null {
  // Exact match
  if (DOMAIN_DB[hostname]) return DOMAIN_DB[hostname];

  // Subdomain match (e.g. research.google.com → google.com)
  const parts = hostname.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (DOMAIN_DB[parent]) return DOMAIN_DB[parent];
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Score a single source URL for trust and credibility.
 * Always returns a score even for unknown domains (defaults to Tier 3 / 5.0).
 */
export function scoreSource(url: string, sourceLabel?: string): SourceTrustScore {
  const hostname = extractHostname(url);

  // 1. Exact or parent-domain database lookup
  const entry = lookupDomain(hostname);
  if (entry) {
    return {
      credibilityScore: Math.round(entry.baseScore * 10) / 10,
      bias:             entry.bias,
      tier:             entry.tier,
      tierLabel:        TIER_LABELS[entry.tier],
      domainAuthority:  entry.authority,
      isVerified:       true,
      tags:             entry.tags,
    };
  }

  // 2. TLD-based trust bonus
  const tldMatch = getTLDBonus(hostname);
  if (tldMatch) {
    return {
      credibilityScore: Math.round((tldMatch.baseScore ?? 8.0) * 10) / 10,
      bias:             tldMatch.bias ?? 'unknown',
      tier:             tldMatch.tier ?? 2,
      tierLabel:        TIER_LABELS[tldMatch.tier ?? 2],
      domainAuthority:  tldMatch.authority ?? 75,
      isVerified:       true,
      tags:             tldMatch.tags ?? [],
    };
  }

  // 3. Heuristic: blog-like subdomain patterns
  if (hostname.includes('blogspot') || hostname.includes('wordpress') || hostname.includes('tumblr')) {
    return { credibilityScore: 3.5, bias: 'unknown', tier: 4, tierLabel: TIER_LABELS[4], domainAuthority: 40, isVerified: false, tags: ['blog', 'user-generated'] };
  }

  // 4. Unknown domain — Tier 3 neutral default
  return {
    credibilityScore: 5.0,
    bias:             'unknown',
    tier:             3,
    tierLabel:        TIER_LABELS[3],
    domainAuthority:  50,
    isVerified:       false,
    tags:             ['general-web'],
  };
}

/**
 * Sort an array of items carrying a `trustScore` property
 * in descending order of credibility.
 */
export function rankByTrust<T extends { trustScore?: SourceTrustScore; url?: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const sa = a.trustScore?.credibilityScore ?? 5;
    const sb = b.trustScore?.credibilityScore ?? 5;
    return sb - sa;
  });
}

/**
 * Score and attach trust scores to an array of search results in-place.
 * Returns the same array (mutated) for convenience.
 */
export function attachTrustScores<T extends { url: string; source?: string; trustScore?: SourceTrustScore }>(
  results: T[],
): T[] {
  for (const r of results) {
    if (!r.trustScore) {
      r.trustScore = scoreSource(r.url, r.source);
    }
  }
  return results;
}

/**
 * Compute a weighted aggregate trust score for a batch of results.
 * Useful for displaying an overall "Source Quality" metric in the UI.
 */
export function computeBatchTrustSummary(
  results: Array<{ trustScore?: SourceTrustScore }>,
): { avgScore: number; tierBreakdown: Record<SourceTrustTier, number>; highQualityPercent: number } {
  const scored = results.filter(r => r.trustScore);
  if (scored.length === 0) {
    return { avgScore: 5, tierBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0 }, highQualityPercent: 0 };
  }

  const tierBreakdown: Record<SourceTrustTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let totalScore = 0;

  for (const r of scored) {
    const t = r.trustScore!;
    totalScore += t.credibilityScore;
    tierBreakdown[t.tier] = (tierBreakdown[t.tier] ?? 0) + 1;
  }

  const avgScore = Math.round((totalScore / scored.length) * 10) / 10;
  const highQuality = (tierBreakdown[1] + tierBreakdown[2]);
  const highQualityPercent = Math.round((highQuality / scored.length) * 100);

  return { avgScore, tierBreakdown, highQualityPercent };
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

export const TIER_LABELS: Record<SourceTrustTier, string> = {
  1: 'Authoritative',
  2: 'Credible',
  3: 'General',
  4: 'Unverified',
};

export const TIER_COLORS: Record<SourceTrustTier, string> = {
  1: '#10B981', // green
  2: '#3B82F6', // blue
  3: '#F59E0B', // amber
  4: '#EF4444', // red
};

export const BIAS_LABELS: Record<SourceBias, string> = {
  'left':         'Left',
  'center-left':  'Center-Left',
  'center':       'Center',
  'center-right': 'Center-Right',
  'right':        'Right',
  'financial':    'Financial',
  'technical':    'Technical',
  'academic':     'Academic',
  'government':   'Official',
  'unknown':      'Unknown',
};

export const BIAS_COLORS: Record<SourceBias, string> = {
  'left':         '#3B82F6',
  'center-left':  '#60A5FA',
  'center':       '#10B981',
  'center-right': '#F97316',
  'right':        '#EF4444',
  'financial':    '#8B5CF6',
  'technical':    '#06B6D4',
  'academic':     '#6366F1',
  'government':   '#059669',
  'unknown':      '#6B7280',
};

/** Returns a color string for a credibility score (0–10). */
export function getScoreColor(score: number): string {
  if (score >= 8.5) return '#10B981'; // green
  if (score >= 7.0) return '#3B82F6'; // blue
  if (score >= 5.5) return '#F59E0B'; // amber
  return '#EF4444';                   // red
}

/** Returns a short badge label for a credibility score. */
export function getScoreLabel(score: number): string {
  if (score >= 9.0) return 'Excellent';
  if (score >= 8.0) return 'High';
  if (score >= 7.0) return 'Good';
  if (score >= 5.5) return 'Fair';
  if (score >= 4.0) return 'Low';
  return 'Poor';
}