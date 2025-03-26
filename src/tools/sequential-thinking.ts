import axios, { AxiosError } from 'axios';
import { OpenRouterConfig, LLMRequest, LLMResponse, Message } from '../types/workflow.js';

/**
 * Interface for a sequential thought
 */
export interface SequentialThought {
  thought: string;
  next_thought_needed: boolean;
  thought_number: number;
  total_thoughts: number;
  is_revision?: boolean;
  revises_thought?: number;
  branch_from_thought?: number;
  branch_id?: string;
  needs_more_thoughts?: boolean;
}

/**
 * The sequential thinking system prompt
 */
export const SEQUENTIAL_THINKING_SYSTEM_PROMPT = `
You are a dynamic and reflective problem-solver that analyzes problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

Follow these guidelines:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty when present
5. Mark thoughts that revise previous thinking or branch into new paths
6. Ignore information that is irrelevant to the current step
7. Generate a solution hypothesis when appropriate
8. Verify the hypothesis based on the Chain of Thought steps
9. Repeat the process until satisfied with the solution
10. Provide a single, correct answer as the final output
11. Only set next_thought_needed to false when truly done and a satisfactory answer is reached

Your response should be a JSON object with these fields:
- thought: Your current thinking step
- next_thought_needed: True if you need more thinking, even if at what seemed like the end
- thought_number: Current number in sequence (can go beyond initial total if needed)
- total_thoughts: Current estimate of thoughts needed (can be adjusted up/down)
- is_revision: A boolean indicating if this thought revises previous thinking
- revises_thought: If is_revision is true, which thought number is being reconsidered
- branch_from_thought: If branching, which thought number is the branching point
- branch_id: Identifier for the current branch (if any)
- needs_more_thoughts: If reaching end but realizing more thoughts needed
`;

/**
 * Process a task using sequential thinking
 * 
 * @param userPrompt The prompt to send to the model
 * @param config OpenRouter configuration
 * @param systemPrompt Optional additional system prompt to add to the sequential thinking prompt
 * @returns The final result of the sequential thinking process
 */
export async function processWithSequentialThinking(
  userPrompt: string,
  config: OpenRouterConfig,
  systemPrompt?: string
): Promise<string> {
  const thoughts: SequentialThought[] = [];
  let currentThought: SequentialThought = {
    thought: '',
    next_thought_needed: true,
    thought_number: 1,
    total_thoughts: 5 // Initial estimate
  };
  
  // Combine sequential thinking system prompt with optional additional prompt
  const fullSystemPrompt = systemPrompt 
    ? `${SEQUENTIAL_THINKING_SYSTEM_PROMPT}\n\n${systemPrompt}`
    : SEQUENTIAL_THINKING_SYSTEM_PROMPT;
  
  // Build a context string that includes all previous thoughts
  const getThoughtContext = () => {
    if (thoughts.length === 0) return '';
    
    return 'Previous thoughts:\n' + 
      thoughts.map(t => `[Thought ${t.thought_number}/${t.total_thoughts}]: ${t.thought}`).join('\n\n');
  };

  // Process thoughts sequentially until next_thought_needed is false
  while (currentThought.next_thought_needed) {
    // Build the context with all previous thoughts
    const thoughtContext = getThoughtContext();
    
    // Create the full prompt
    const prompt = thoughtContext 
      ? `${thoughtContext}\n\nTask: ${userPrompt}\n\nContinue with the next thought:`
      : `Task: ${userPrompt}\n\nProvide your first thought:`;
    
    // Log the current state (useful for debugging)
    console.error(`Processing thought ${currentThought.thought_number} (total estimate: ${currentThought.total_thoughts})...`);
    
    // Get the next thought from the AI
    const nextThought = await getNextThought(prompt, fullSystemPrompt, config);
    
    // Add the thought to our history
    thoughts.push(nextThought);
    currentThought = nextThought;
  }
  
  // Extract the solution from the final thought
  return currentThought.thought;
}

/**
 * Get the next thought from the AI
 */
async function getNextThought(
  prompt: string,
  systemPrompt: string,
  config: OpenRouterConfig
): Promise<SequentialThought> {
  try {
    const response = await axios.post(
      `${config.baseUrl}/chat/completions`,
      {
        model: config.geminiModel,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
        temperature: 0.7
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
          "HTTP-Referer": "https://vibe-coder-mcp.local"
        }
      }
    );

    // Extract the response
    if (response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message.content;
      
      try {
        // Parse the JSON response
        const thought = JSON.parse(content) as SequentialThought;
        
        // Validate required fields
        if (
          typeof thought.thought !== 'string' ||
          typeof thought.next_thought_needed !== 'boolean' ||
          typeof thought.thought_number !== 'number' ||
          typeof thought.total_thoughts !== 'number'
        ) {
          throw new Error('Invalid thought format - missing required fields');
        }
        
        return thought;
      } catch (parseError) {
        console.error("Failed to parse thought:", parseError);
        // Create a fallback thought if parsing fails
        return {
          thought: typeof content === 'string' ? content : String(content),
          next_thought_needed: false,
          thought_number: 1,
          total_thoughts: 1
        };
      }
    } else {
      throw new Error("No response received from model");
    }
  } catch (error) {
    console.error("API Error:", error);
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      throw new Error(`API error: ${axiosError.response?.status} - ${JSON.stringify(axiosError.response?.data || {})}`);
    }
    throw new Error(`Unknown error: ${String(error)}`);
  }
}
