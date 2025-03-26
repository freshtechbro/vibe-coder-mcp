import { matchRequest, extractParameters } from "../matching-service/index.js";
import { detectIntent, extractContextParameters } from "../intent-service/index.js";
import { MatchResult } from "../../types/tools.js";
import { processWithSequentialThinking } from "../../tools/sequential-thinking.js";
import { OpenRouterConfig } from "../../types/workflow.js";

// Confidence thresholds
const HIGH_CONFIDENCE = 0.8;
const MEDIUM_CONFIDENCE = 0.6;
const LOW_CONFIDENCE = 0.4;

/**
 * Hybrid matching result with additional metadata
 */
export interface EnhancedMatchResult extends MatchResult {
  parameters: Record<string, string>;
  matchMethod: "rule" | "intent" | "sequential";
  requiresConfirmation: boolean;
}

/**
 * Main hybrid matching function that implements the fallback flow
 * 1. Try rule-based matching
 * 2. Try intent-based matching
 * 3. Fall back to sequential thinking
 *
 * @param request The user request to match
 * @param config OpenRouter configuration for sequential thinking
 * @returns Enhanced match result with parameters and metadata
 */
export async function hybridMatch(
  request: string,
  config: OpenRouterConfig
): Promise<EnhancedMatchResult> {
  let matchResult: MatchResult | null;
  let parameters: Record<string, string> = {};
  let matchMethod: "rule" | "intent" | "sequential" = "sequential"; 
  let requiresConfirmation = false;

  // Step 1: Try rule-based matching first (highest priority)
  matchResult = matchRequest(request);
  
  if (matchResult && matchResult.confidence >= MEDIUM_CONFIDENCE) {
    // Successfully matched via rules
    matchMethod = "rule";
    
    // Extract parameters if we have a matched pattern
    if (matchResult.matchedPattern && matchResult.matchedPattern !== "description_match") {
      parameters = extractParameters(request, matchResult.matchedPattern);
    }
    
    // Only require confirmation for low confidence matches
    requiresConfirmation = matchResult.confidence < HIGH_CONFIDENCE;
    
    return {
      ...matchResult,
      parameters,
      matchMethod,
      requiresConfirmation
    };
  }
  
  // Step 2: Try intent-based matching as fallback
  const intentResult = detectIntent(request);
  
  if (intentResult && intentResult.confidence >= LOW_CONFIDENCE) {
    // Successfully matched via intent
    matchMethod = "intent";
    matchResult = intentResult;
    
    // Extract parameters using context-based extraction
    parameters = extractContextParameters(request);
    
    // Intent-based matches generally require confirmation unless high confidence
    requiresConfirmation = intentResult.confidence < HIGH_CONFIDENCE;
    
    return {
      ...intentResult,
      parameters,
      matchMethod,
      requiresConfirmation
    };
  }
  
  // Step 3: Fall back to sequential thinking for ambiguous requests
  try {
    // Use sequential thinking to determine the most likely tool
    const sequentialResult = await performSequentialThinking(
      request, 
      "What tool should I use for this request? Options are: research-manager, prd-generator, user-stories-generator, task-list-generator, rules-generator, workflow-manager.",
      config
    );
    
    // Extract the tool name from the response
    const toolName = sequentialResult.toLowerCase()
      .trim()
      .split("\n")[0]
      .replace(/^.*?: /, "");
    
    if (toolName && (toolName.includes("generator") || toolName.includes("manager"))) {
      matchResult = {
        toolName: toolName,
        confidence: 0.5, // Medium confidence for sequential thinking
        matchedPattern: "sequential_thinking"
      };
      
      matchMethod = "sequential";
      
      // Always require confirmation for sequential matches
      requiresConfirmation = true;
      
      // Extract parameters using context
      parameters = extractContextParameters(request);
      
      return {
        ...matchResult,
        parameters,
        matchMethod,
        requiresConfirmation
      };
    }
  } catch (error) {
    console.error("Sequential thinking failed:", error);
  }
  
  // If all else fails, return a default match to the research manager
  // This ensures we always return something, but with low confidence
  return {
    toolName: "research-manager",
    confidence: 0.2,
    matchedPattern: "fallback",
    parameters: { query: request },
    matchMethod: "sequential",
    requiresConfirmation: true
  };
}

/**
 * Helper function to use sequential thinking for tool selection
 *
 * @param request The user's request
 * @param systemPrompt The prompt to guide sequential thinking
 * @param config OpenRouter configuration
 * @returns The result of sequential thinking
 */
async function performSequentialThinking(
  request: string,
  systemPrompt: string,
  config: OpenRouterConfig
): Promise<string> {
  const prompt = `Given this user request: "${request}"
  
${systemPrompt}

Analyze the request and determine which tool is most appropriate. Reply with just the name of the most appropriate tool.`;

  return await processWithSequentialThinking(prompt, config);
}

/**
 * Get a human-readable description of why a match was chosen
 * 
 * @param match The enhanced match result
 * @returns A string explaining the match
 */
export function getMatchExplanation(match: EnhancedMatchResult): string {
  switch (match.matchMethod) {
    case "rule":
      if (match.matchedPattern === "description_match") {
        return `I chose the ${match.toolName} because keywords in your request matched its description.`;
      } else {
        return `I chose the ${match.toolName} because your request matched the pattern: "${match.matchedPattern}"`;
      }
      
    case "intent":
      return `I chose the ${match.toolName} based on the intent of your request. I'm ${Math.round(match.confidence * 100)}% confident this is what you meant.`;
      
    case "sequential":
      if (match.matchedPattern === "fallback") {
        return `I wasn't sure which tool to use, so I'm defaulting to the ${match.toolName}. Please let me know if you'd prefer a different tool.`;
      } else {
        return `After analyzing your request, I believe the ${match.toolName} is the most appropriate tool to use.`;
      }
      
    default:
      return `I selected the ${match.toolName} based on your request.`;
  }
}
