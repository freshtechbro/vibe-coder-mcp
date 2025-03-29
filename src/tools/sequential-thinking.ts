import axios, { AxiosError } from 'axios';
import { OpenRouterConfig, LLMRequest, LLMResponse, Message } from '../types/workflow.js';
import logger from '../logger.js';
import { sequentialThoughtSchema, SequentialThought as ZodSequentialThought } from '../types/sequentialThought.js';
import { ApiError, ParsingError, ValidationError, AppError } from '../utils/errors.js'; // Import custom errors

/**
 * Interface for a sequential thought (Keep for internal use if needed, but Zod type is primary)
 */
interface SequentialThought { // Renamed to avoid conflict if Zod type is named the same
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
    const thoughtContext = getThoughtContext();
    const initialPrompt = thoughtContext
      ? `${thoughtContext}\n\nTask: ${userPrompt}\n\nContinue with the next thought:`
      : `Task: ${userPrompt}\n\nProvide your first thought:`;

    logger.debug(`Processing thought ${currentThought.thought_number} (total estimate: ${currentThought.total_thoughts})...`);

    const maxRetries = 3; // 1 initial attempt + 2 retries
    let lastError: Error | null = null;
    let currentPromptForLLM = initialPrompt; // Use a mutable variable for the prompt
    let nextThought: ZodSequentialThought | null = null; // Initialize as null, use Zod type

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Get the next thought from the AI using the potentially modified prompt
        nextThought = await getNextThought(currentPromptForLLM, fullSystemPrompt, config);
        lastError = null; // Clear error on success
        logger.debug(`Attempt ${attempt} to get thought ${currentThought.thought_number} succeeded.`);
        break; // Exit retry loop on success
      } catch (error) {
        lastError = error as Error;
        logger.warn({ err: lastError, attempt, maxRetries }, `Attempt ${attempt} to get thought ${currentThought.thought_number} failed.`);

        if (attempt === maxRetries) {
          logger.error(`All ${maxRetries} attempts failed for thought ${currentThought.thought_number}.`);
          // Error will be thrown after the loop
        } else {
          // Prepare prompt for retry, including the error message
          currentPromptForLLM = `${initialPrompt}\n\nYour previous attempt (attempt ${attempt}) failed with this error: ${lastError.message}\nPlease carefully review the required JSON format and schema described in the system prompt, then provide a valid JSON object.\nRetry thought generation:`;
          logger.info(`Retrying thought generation (attempt ${attempt + 1})...`);
          // Optional delay could be added here:
          // await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // If all retries failed, throw the last error encountered
    if (lastError !== null) {
      throw lastError;
    }

    // Ensure nextThought is not null before proceeding (should be guaranteed if no error was thrown)
    if (!nextThought) {
       // This state should not be reachable if the logic is correct
       logger.error("Internal error: nextThought is null after retry loop without throwing an error.");
       throw new Error("Internal error: Failed to retrieve thought after retries.");
    }

    // Add the successfully retrieved thought to our history
    // Need to cast nextThought back to the internal SequentialThought interface if it's different
    // Or adjust the 'thoughts' array type to ZodSequentialThought
    thoughts.push(nextThought as SequentialThought); // Assuming internal interface is compatible enough for history
    currentThought = nextThought as SequentialThought; // Update currentThought
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
): Promise<ZodSequentialThought> {
  // This outer try/catch remains primarily for the retry logic in processWithSequentialThinking
  // The actual error classification happens in the inner try/catch
  try { // New inner try block
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
      let parsedContent: any;

      try {
        // First, try parsing the raw content as JSON
        parsedContent = JSON.parse(content);
      } catch (jsonError) {
        logger.error({ err: jsonError, rawContent: content }, "LLM output was not valid JSON.");
        // Throw specific ParsingError
        throw new ParsingError(
          `LLM output was not valid JSON`,
          { rawContent: content },
          jsonError instanceof Error ? jsonError : undefined
        );
      }

      // If JSON parsing succeeded, validate with Zod schema
      const validationResult = sequentialThoughtSchema.safeParse(parsedContent);

      if (validationResult.success) {
        logger.debug('Sequential thought successfully parsed and validated.');
        // Return the validated data (type is inferred by Zod)
        return validationResult.data;
      } else {
        // Log detailed validation errors
        logger.error({ errors: validationResult.error.issues, rawContent: content }, 'Sequential thought schema validation failed');
        // Throw specific ValidationError
        throw new ValidationError(
          `Sequential thought validation failed: ${validationResult.error.message}`,
          validationResult.error.issues,
          { rawContent: content }
        );
      }

    } else {
       logger.warn({ responseData: response.data }, "No choices found in LLM response for sequential thought.");
       // Throw specific ParsingError
       throw new ParsingError(
         "No response choices received from model for sequential thought",
         { responseData: response.data }
       );
    }
  } catch (error) { // New inner catch block
    // Handle Axios errors specifically first
     if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;
        const responseData = axiosError.response?.data;
        const apiMessage = `OpenRouter API Error: Status ${status || 'N/A'}. ${axiosError.message}`;
        logger.error({ err: axiosError, status, responseData }, apiMessage);
        // Throw specific ApiError, propagating original error
        throw new ApiError(
          apiMessage,
          status,
          { model: config.geminiModel, responseData },
          axiosError
        );
     }
     // Re-throw other AppErrors (like ParsingError, ValidationError) caught within the inner try
     else if (error instanceof AppError) {
         throw error; // Pass custom errors up to the retry logic
     }
     // Wrap unknown errors
     else if (error instanceof Error) {
          logger.error({ err: error }, "Unknown error during getNextThought API call/processing");
          throw new AppError(`Failed to get next thought: ${error.message}`, undefined, error);
     } else {
          logger.error({ errorData: error }, "Unknown non-error thrown during getNextThought");
          throw new AppError("Unknown failure while getting next thought.");
     }
  }
}
