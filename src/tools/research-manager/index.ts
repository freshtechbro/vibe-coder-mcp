import fs from 'fs-extra';
import path from 'path';
import { OpenRouterConfig } from '../../types/workflow.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';
import logger from '../../logger.js';

// Ensure directories exist
const RESEARCH_DIR = path.join(process.cwd(), 'workflow-agent-files', 'research-manager');

// Initialize directories if they don't exist
export async function initDirectories() {
  await fs.ensureDir(RESEARCH_DIR);
}

// Research manager-specific system prompt
const RESEARCH_SYSTEM_PROMPT = `
You are a research specialist with advanced capabilities for gathering accurate, comprehensive, and relevant information.
Your goal is to provide complete, thoughtful analyses that cover the topic thoroughly, leaving no important aspects unaddressed.

When conducting research, follow these guidelines:
1. Be comprehensive - cover all relevant aspects of the topic
2. Organize information logically with clear sections and headings
3. Cite relevant sources when applicable
4. Prioritize factual accuracy above all else
5. Consider multiple perspectives on the topic
6. Highlight practical applications of the information
7. Identify limitations or gaps in current knowledge
8. Use clear, concise language that balances technical accuracy with readability
9. Address common misconceptions directly
10. Consider how this information relates to real-world contexts

Format your response as a well-structured research report with these sections:
- Executive Summary
- Key Findings
- Detailed Analysis
- Practical Applications
- Limitations and Caveats
- Recommendations

Your research should be comprehensive enough to serve as a foundation for decision-making or further exploration.
`;

/**
 * Perform research on a topic using Perplexity Sonar via OpenRouter
 */
export async function performResearch(
  query: string,
  config: OpenRouterConfig
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    await initDirectories();
    
    // Generate a filename for storing research
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedQuery = query.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${timestamp}-${sanitizedQuery}-research.md`;
    const filePath = path.join(RESEARCH_DIR, filename);
    
    // Process the research request
    logger.info(`Performing research on: ${query.substring(0, 50)}...`);
    
    // Use Perplexity model for research via centralized helper
    const researchResult = await performResearchQuery(query, config);
    
    // Process with sequential thinking to enhance the research
    const enhancedResearch = await processWithSequentialThinking(
      `Conduct thorough research on the following query:\n\n${query}\n\nIncorporate this information: ${researchResult}`,
      config,
      RESEARCH_SYSTEM_PROMPT
    );
    
    // Format the research with a title header
    const formattedResult = `# Research: ${query}\n\n${enhancedResearch}\n\n_Generated: ${new Date().toLocaleString()}_`;
    
    // Save the result
    await fs.writeFile(filePath, formattedResult, 'utf8');
    
    return {
      content: [
        {
          type: "text",
          text: formattedResult
        }
      ]
    };
  } catch (error) {
    logger.error({ err: error }, 'Research Manager Error');
    return {
      content: [
        {
          type: "text",
          text: `Error performing research: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}
