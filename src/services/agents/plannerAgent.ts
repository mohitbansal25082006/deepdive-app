// src/services/agents/plannerAgent.ts
// Part 25 — Updated
//
// CHANGES FROM PART 24:
//   • Uses DEPTH_SEARCH_CONFIG to determine maxQueries per depth
//     (Quick:4 / Deep:8 / Expert:12) — previously hardcoded
//   • Generates `followUpSeeds` — topic angles the follow-up round will search
//   • Generates `newsQuerySeeds` — topic seeds for the news search round
//   • Prompts the model to produce higher diversity of query types:
//     data/statistics, comparison, news/recent, expert opinion, geography-specific
//   • All previous fields (topic, subtopics, searchQueries, researchGoals,
//     estimatedDepth, keyEntities) are preserved exactly

import { chatCompletionJSON }    from '../openaiClient';
import { ResearchInput, ResearchPlan, DEPTH_SEARCH_CONFIG } from '../../types';

// Extended plan with Part 25 additions
export interface ResearchPlanV2 extends ResearchPlan {
  /** Seeds for the follow-up search round (Deep/Expert only) */
  followUpSeeds: string[];
  /** Seeds for the Google News search round (Deep/Expert only) */
  newsQuerySeeds: string[];
}

export async function runPlannerAgent(input: ResearchInput): Promise<ResearchPlanV2> {
  const config     = DEPTH_SEARCH_CONFIG[input.depth];
  const queryCount = config.maxQueries;
  const isDeep     = input.depth === 'deep';
  const isExpert   = input.depth === 'expert';

  const focusContext = input.focusAreas.length > 0
    ? `\n\nThe user specifically wants to focus on: ${input.focusAreas.join(', ')}.`
    : '';

  const depthGuidance = isExpert
    ? `This is EXPERT MODE — produce exhaustive, highly specific queries covering:
       technical details, academic/scientific angles, regulatory frameworks, financial data,
       geographic breakdowns, competitive intelligence, and future predictions.
       Include at least 3 data-heavy queries with explicit numeric targets.`
    : isDeep
    ? `This is DEEP DIVE MODE — produce comprehensive queries covering:
       market data, key players, trends, challenges, recent news, statistics,
       and at least 2 comparison queries (e.g. "X vs Y").`
    : `This is QUICK SCAN MODE — produce concise, high-signal queries that
       cover the most important aspects of the topic efficiently.`;

  const systemPrompt = `You are an elite research strategist and intelligence analyst.
Your role is to decompose a research query into a precise, actionable plan that will be
executed by an autonomous multi-round web search system.

${depthGuidance}

QUERY DIVERSITY RULES — for the ${queryCount} primary searchQueries:
  • Include queries with specific years (2024, 2025) for recency
  • Include at least 1 statistics/data query (e.g. "X market size billion 2025")
  • Include at least 1 "how does X work" or technical detail query
  • Include at least 1 recent news/development query
  ${isDeep || isExpert ? '• Include at least 1 comparison/VS query\n  • Include at least 1 challenge/risk query' : ''}
  ${isExpert ? '• Include at least 2 academic/research/paper queries\n  • Include at least 1 regulatory/government policy query\n  • Include at least 1 geographic/regional breakdown query' : ''}
  • NO duplicate intent — each query must cover a genuinely different angle`;

  const userPrompt = `Research Query: "${input.query}"
Research Depth: ${input.depth.toUpperCase()}${focusContext}

Create a comprehensive research plan with EXACTLY ${queryCount} primary search queries.
${isDeep || isExpert ? `Also provide ${config.followUpQueries} followUpSeeds and ${config.newsQueries} newsQuerySeeds.` : ''}

Return ONLY valid JSON:
{
  "topic": "Refined, clear topic title (10 words or less)",
  "subtopics": ["subtopic1", "subtopic2", "subtopic3", "subtopic4", "subtopic5"],
  "searchQueries": [${Array.from({ length: queryCount }, (_, i) => `"specific diverse query ${i + 1}"`).join(', ')}],
  "researchGoals": ["goal1", "goal2", "goal3", "goal4"],
  "estimatedDepth": "${input.depth}",
  "keyEntities": ["entity1", "entity2", "entity3", "entity4", "entity5"],
  ${isDeep || isExpert ? `"followUpSeeds": [${Array.from({ length: config.followUpQueries }, (_, i) => `"follow-up angle ${i + 1}"`).join(', ')}],` : '"followUpSeeds": [],'}
  ${isDeep || isExpert ? `"newsQuerySeeds": [${Array.from({ length: config.newsQueries }, (_, i) => `"news angle ${i + 1}"`).join(', ')}]` : '"newsQuerySeeds": []'}
}

CRITICAL: searchQueries must be EXACTLY ${queryCount} entries. Make every query specific,
unique in intent, and directly useful for researching "${input.query}".
For followUpSeeds — provide short topic phrases (not full queries) that will be used to
generate targeted follow-up searches after seeing Round 1 results.
For newsQuerySeeds — provide news-focused topic angles (recent events, announcements, updates).`;

  const plan = await chatCompletionJSON<ResearchPlanV2>([
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt   },
  ], { temperature: 0.4, maxTokens: 2000 });

  // Validate & patch
  if (!plan.searchQueries || plan.searchQueries.length === 0) {
    throw new Error('Planner agent returned invalid research plan — no search queries');
  }

  // Clamp to configured count in case model over/under-generates
  plan.searchQueries = plan.searchQueries.slice(0, queryCount);

  // Ensure arrays exist
  plan.subtopics       = Array.isArray(plan.subtopics)       ? plan.subtopics       : [];
  plan.researchGoals   = Array.isArray(plan.researchGoals)   ? plan.researchGoals   : [];
  plan.keyEntities     = Array.isArray(plan.keyEntities)     ? plan.keyEntities     : [];
  plan.followUpSeeds   = Array.isArray(plan.followUpSeeds)   ? plan.followUpSeeds   : [];
  plan.newsQuerySeeds  = Array.isArray(plan.newsQuerySeeds)  ? plan.newsQuerySeeds  : [];

  return plan;
}