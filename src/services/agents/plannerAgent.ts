// src/services/agents/plannerAgent.ts
// PLANNER AGENT
// Receives the raw user query and produces a structured research plan:
// subtopics, search queries, entities to track, and research goals.

import { chatCompletionJSON } from '../openaiClient';
import { ResearchInput, ResearchPlan } from '../../types';

const DEPTH_QUERY_COUNT: Record<string, number> = {
  quick: 4,
  deep: 8,
  expert: 12,
};

export async function runPlannerAgent(input: ResearchInput): Promise<ResearchPlan> {
  const queryCount = DEPTH_QUERY_COUNT[input.depth] ?? 8;
  const focusContext = input.focusAreas.length > 0
    ? `\n\nThe user specifically wants to focus on: ${input.focusAreas.join(', ')}.`
    : '';

  const systemPrompt = `You are an elite research strategist and intelligence analyst. Your role is to decompose a user's research query into a precise, actionable research plan that will be executed by an autonomous AI agent system.

You must produce ${queryCount} highly specific, diverse search queries that together cover the topic comprehensively. Each query should target a different angle: current state, history, key players, market data, technical details, future outlook, challenges, and recent news.

Think like a professional research analyst. Be specific, not generic.`;

  const userPrompt = `Research Query: "${input.query}"
Research Depth: ${input.depth.toUpperCase()}${focusContext}

Create a comprehensive research plan. Return ONLY valid JSON with this exact structure:
{
  "topic": "Refined, clear topic title",
  "subtopics": ["subtopic1", "subtopic2", "subtopic3", "subtopic4", "subtopic5"],
  "searchQueries": [${Array.from({ length: queryCount }, (_, i) => `"specific search query ${i + 1}"`).join(', ')}],
  "researchGoals": ["goal1", "goal2", "goal3", "goal4"],
  "estimatedDepth": "${input.depth}",
  "keyEntities": ["company/person/technology to track 1", "entity 2", "entity 3"]
}

Make search queries highly specific and varied. Include year (2024 or 2025) in some queries. Include data/statistics queries. Include "vs" comparison queries. Include news/recent developments queries.`;

  const plan = await chatCompletionJSON<ResearchPlan>([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.4 });

  // Validate the plan
  if (!plan.searchQueries || plan.searchQueries.length === 0) {
    throw new Error('Planner agent returned invalid research plan');
  }

  return plan;
}