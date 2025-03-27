import axios from 'axios';
import { OpenRouterConfig, ToolResponse } from '../../types/workflow.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';

/**
 * Input schema for the Fullstack Starter Kit Generator tool
 */
export interface FullstackStarterKitInput {
  use_case: string;
  tech_stack_preferences?: {
    frontend?: string;
    backend?: string;
    database?: string;
    orm?: string;
    authentication?: string;
    deployment?: string;
    [key: string]: string | undefined;
  };
  request_recommendation?: boolean;
  include_optional_features?: string[];
}

/**
 * Generate a fullstack starter kit
 * 
 * @param input User input for the generator
 * @param config OpenRouter configuration
 * @returns The generated starter kit with files and documentation
 */
export async function generateFullstackStarterKit(
  input: FullstackStarterKitInput,
  config: OpenRouterConfig
): Promise<ToolResponse> {
  const logs: string[] = [];
  const errors: string[] = [];
  
  try {
    // Log the start
    logs.push(`[${new Date().toISOString()}] Starting Fullstack Starter Kit Generator`);
    logs.push(`[${new Date().toISOString()}] Use case: ${input.use_case}`);
    
    // Step 1: Analyze the use case and tech stack preferences using sequential thinking
    const analysisPrompt = `
You are tasked with creating a fullstack starter kit for the following use case:
${input.use_case}

Tech stack preferences (if any):
${JSON.stringify(input.tech_stack_preferences || {}, null, 2)}

Request recommendation: ${input.request_recommendation ? 'Yes' : 'No'}
Include optional features: ${JSON.stringify(input.include_optional_features || [], null, 2)}

Please provide a comprehensive analysis of:
1. The most appropriate tech stack for this use case
2. Core features that should be included
3. Project structure and architecture
4. Key configurations and best practices

Base your recommendations on modern development practices and the specific needs of the use case.
`;

    const analysis = await processWithSequentialThinking(analysisPrompt, config);
    logs.push(`[${new Date().toISOString()}] Completed initial analysis`);
    
    // Skip external research and rely solely on the input parameters
    let researchResults = '';
    if (input.request_recommendation) {
      logs.push(`[${new Date().toISOString()}] Using built-in knowledge for recommendations`);
    }
    
    // Step 3: Generate the final recommendation
    const finalPrompt = `
Based on your analysis of the use case:
${input.use_case}

${researchResults ? `And considering this additional research:\n${researchResults}\n\n` : ''}

Please provide a detailed starter kit recommendation in the following JSON format:

{
  "tech_stack": {
    // Key technology choices with explanations
  },
  "architecture": "description of the architectural approach",
  "features": {
    "core": [
      // List of essential features
    ],
    "optional": [
      // List of nice-to-have features
    ]
  },
  "structure": [
    // Project structure description
  ],
  "files": {
    // Key files with example content
  },
  "setup_instructions": [
    // Instructions for setting up the project
  ]
}

Ensure the recommendation is comprehensive, follows best practices, and is tailored to the specific use case.
`;

    const finalRecommendation = await processWithSequentialThinking(finalPrompt, config);
    logs.push(`[${new Date().toISOString()}] Generated final recommendation`);
    
    // Format the response
    const responseText = `
# Fullstack Starter Kit Generator

## Use Case
${input.use_case}

## Recommendation
${finalRecommendation}

## Next Steps
1. Review the recommended tech stack and architecture
2. Implement the project structure as outlined
3. Follow the setup instructions to get started
4. Add or modify features based on your specific requirements

Generated with the Fullstack Starter Kit Generator
`;

    return {
      content: [
        {
          type: "text",
          text: responseText
        }
      ]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(errorMessage);
    logs.push(`[${new Date().toISOString()}] Error: ${errorMessage}`);
    
    return {
      content: [
        {
          type: "text",
          text: `Error generating fullstack starter kit: ${errorMessage}\n\nLogs:\n${logs.join('\n')}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Execute a search using the Perplexity Sonar API
 */
async function perplexitySonarSearch(
  query: string,
  config: OpenRouterConfig
): Promise<{ query: string; answer: string }> {
  try {
    const response = await axios.post(
      `${config.baseUrl}/chat/completions`,
      {
        model: config.perplexityModel,
        messages: [
          {
            role: "system",
            content: "You are Perplexity Sonar, a search assistant. Perform a detailed search based on the user's query."
          },
          {
            role: "user",
            content: query
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
          "HTTP-Referer": "https://vibe-coder-mcp.local"
        }
      }
    );

    if (response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message.content;
      return {
        query,
        answer: content
      };
    } else {
      throw new Error("No response received from Perplexity Sonar");
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`API error: ${error.message}`);
    }
    throw new Error(`Unknown error: ${String(error)}`);
  }
}
