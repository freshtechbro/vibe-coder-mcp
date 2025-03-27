import axios, { AxiosError } from 'axios';
import { OpenRouterConfig } from '../types/workflow.js';
import logger from '../logger.js';

/**
 * Performs a single research query using the configured Perplexity model.
 * @param query The research query string.
 * @param config OpenRouter configuration containing the specific perplexityModel name.
 * @returns The research result content as a string.
 * @throws Error if the API call fails or returns no content.
 */
export async function performResearchQuery(query: string, config: OpenRouterConfig): Promise<string> {
  logger.debug({ query, model: config.perplexityModel }, "Performing Perplexity research query"); // Log the model being used
  if (!config.perplexityModel) {
    throw new Error("Perplexity model name is not configured.");
  }
  try {
    const response = await axios.post(
      `${config.baseUrl}/chat/completions`,
      {
        model: config.perplexityModel, // Use the specific model from config
        messages: [
          { role: "system", content: "You are a sophisticated AI research assistant using Perplexity Sonar Deep Research. Provide comprehensive, accurate, and up-to-date information. Research the user's query thoroughly." },
          { role: "user", content: query }
        ],
        max_tokens: 4000,
        temperature: 0.1
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
          "HTTP-Referer": "https://vibe-coder-mcp.local" // Optional
        },
        timeout: 90000 // Increased timeout for potentially deeper research (90s)
      }
    );

    if (response.data?.choices?.[0]?.message?.content) {
      logger.debug({ query }, "Perplexity query successful");
      return response.data.choices[0].message.content.trim();
    } else {
      logger.warn({ query, responseData: response.data }, "Received empty or unexpected response from Perplexity");
      throw new Error("No valid content received from Perplexity API");
    }
  } catch (error) {
    logger.error({ err: error, query, model: config.perplexityModel }, "Perplexity API call failed"); // Log model on error too
    let errorMessage = `Perplexity research failed for query: "${query}". Model: ${config.perplexityModel}.`;
    if (axios.isAxiosError(error)) {
      if (error.response) {
        errorMessage += ` Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data || {})}`;
      } else if (error.request) {
        errorMessage += ` No response received. ${error.message}`;
      } else {
        errorMessage += ` Request setup failed. ${error.message}`;
      }
    } else {
      errorMessage += ` Details: ${String(error)}`;
    }
    throw new Error(errorMessage);
  }
}
