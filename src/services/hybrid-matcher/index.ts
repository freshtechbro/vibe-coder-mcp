// Removed imports for matchRequest, extractParameters, detectIntent, and extractContextParameters
import { MatchResult } from "../../types/tools.js";
import { processWithSequentialThinking } from "../../tools/sequential-thinking.js";
import { OpenRouterConfig } from "../../types/workflow.js";
import { findBestSemanticMatch } from "../routing/semanticMatcher.js";
import logger from "../../logger.js";

// Confidence thresholds
const HIGH_CONFIDENCE = 0.8;
const MEDIUM_CONFIDENCE = 0.6;
const LOW_CONFIDENCE = 0.4;

/**
 * Hybrid matching result with additional metadata
 */
export interface EnhancedMatchResult extends MatchResult {
  parameters: Record<string, string>;
  matchMethod: "rule" | "intent" | "semantic" | "sequential"; // Added "semantic"
  requiresConfirmation: boolean;
}

/**
 * Main hybrid matching function that implements the fallback flow
 * 1. Try Semantic Matching
 * 2. Fall back to Sequential Thinking
 * 3. Default Fallback
 *
 * @param request The user request to match
 * @param config OpenRouter configuration for sequential thinking
 * @returns Enhanced match result with parameters and metadata
 */
export async function hybridMatch(
  request: string,
  config: OpenRouterConfig
): Promise<EnhancedMatchResult> {
  let matchResult: MatchResult | null = null;
  let parameters: Record<string, string> = {};
  // Default to sequential, semantic will override if successful
  let matchMethod: "semantic" | "sequential" = "sequential";
  let requiresConfirmation = true; // Default to true, semantic match might override

  // Step 1: Try Semantic Matching
  logger.debug('Trying semantic matching...');
  const semanticMatchResult = await findBestSemanticMatch(request);

  if (semanticMatchResult) {
    // Successfully matched via semantic similarity
    matchMethod = "semantic";
    matchResult = semanticMatchResult; // Assign the successful match

    // Parameter extraction removed for now - can be added back later
    parameters = {}; // Default to empty parameters

    // Require confirmation for lower confidence semantic matches
    requiresConfirmation = semanticMatchResult.confidence < HIGH_CONFIDENCE;

    logger.info(`Match found via semantic search: ${matchResult.toolName} (Confidence: ${matchResult.confidence.toFixed(3)})`);
    return {
      ...matchResult, // No need for type assertion if matchResult is correctly typed now
      parameters,
      matchMethod,
      requiresConfirmation
    };
  } else {
     logger.debug('Semantic matching did not yield a confident result. Falling back to sequential thinking...');
  }
  
  // Step 2: Fall back to sequential thinking for ambiguous requests (Only if semantic match failed)
  // Note: matchMethod remains 'sequential' if semantic match failed
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
      
      // Parameter extraction removed for now - can be added back later
      parameters = {}; // Default to empty parameters
      
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
    // Removed "rule" and "intent" cases
    case "semantic":
      return `I chose the ${match.toolName} because your request seems semantically similar to its purpose. I'm ${Math.round(match.confidence * 100)}% confident.`;
      
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
