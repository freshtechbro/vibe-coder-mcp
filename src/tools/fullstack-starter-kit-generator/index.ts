import { OpenRouterConfig, ToolResponse } from '../../types/workflow.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';
import fs from 'fs-extra';
import path from 'path';
import { starterKitDefinitionSchema, StarterKitDefinition } from './schema.js';
import { generateSetupScripts, ScriptOutput } from './scripts.js';

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

// Ensure directories exist
const STARTER_KIT_DIR = path.join(process.cwd(), 'workflow-agent-files', 'fullstack-starter-kit-generator');

// Initialize directories if they don't exist
export async function initDirectories() {
  await fs.ensureDir(STARTER_KIT_DIR);
}

/**
 * Generate a fullstack starter kit with automatic validation
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
    logger.info(`Starting Fullstack Starter Kit Generator for use case: ${input.use_case}`);
    logs.push(`[${new Date().toISOString()}] Starting Fullstack Starter Kit Generator`);
    logs.push(`[${new Date().toISOString()}] Use case: ${input.use_case}`);
    
    // Step 1: Analyze the use case and tech stack preferences using sequential thinking
    const analysisPrompt = `
You are tasked with creating a fullstack starter kit based on the following use case:
${input.use_case}

Tech stack preferences (if any):
${JSON.stringify(input.tech_stack_preferences || {}, null, 2)}

Request recommendation: ${input.request_recommendation ? 'Yes' : 'No'}
Include optional features: ${JSON.stringify(input.include_optional_features || [], null, 2)}

If research context is provided in the following steps, carefully consider the information about technology stack recommendations, best practices, architectural patterns, and development tooling from Perplexity Sonar Deep Research.

Please provide a comprehensive analysis of:
1. The most appropriate tech stack for this use case
2. Core features that should be included
3. Project structure and architecture
4. Key configurations and best practices

Base your recommendations on modern development practices, the specific needs of the use case, and any research insights provided.
Do NOT attempt to access external files or previous context outside of what's provided in this prompt.
`;

    const analysis = await processWithSequentialThinking(analysisPrompt, config);
    logger.debug('Completed initial analysis');
    logs.push(`[${new Date().toISOString()}] Completed initial analysis`);
    
    // Perform pre-generation research using Perplexity if recommendation is requested
    let researchContext = '';
    if (input.request_recommendation) {
      logger.info({ inputs: { use_case: input.use_case } }, "Fullstack Starter Kit Generator: Starting pre-generation research...");
      logs.push(`[${new Date().toISOString()}] Starting pre-generation research using Perplexity (sonar-deep-research)`);
      
      try {
        // Define relevant research queries
        const query1 = `Latest technology stack recommendations for ${input.use_case}`;
        const query2 = `Best practices and architectural patterns for ${input.use_case}`;
        const query3 = `Modern development tooling and libraries for ${input.use_case}`;
        
        // Execute research queries in parallel using Perplexity
        const researchResults = await Promise.allSettled([
          performResearchQuery(query1, config), // Uses config.perplexityModel (perplexity/sonar-deep-research)
          performResearchQuery(query2, config),
          performResearchQuery(query3, config)
        ]);
        
        // Process research results
        researchContext = "## Pre-Generation Research Context (From Perplexity Sonar Deep Research):\n\n";
        
        // Add results that were fulfilled
        researchResults.forEach((result, index) => {
          const queryLabels = ["Technology Stack Recommendations", "Best Practices & Architecture", "Development Tooling & Libraries"];
          if (result.status === "fulfilled") {
            researchContext += `### ${queryLabels[index]}:\n${result.value.trim()}\n\n`;
          } else {
            logger.warn({ error: result.reason }, `Research query ${index + 1} failed`);
            researchContext += `### ${queryLabels[index]}:\n*Research on this topic failed.*\n\n`;
          }
        });
        
        logger.info("Fullstack Starter Kit Generator: Pre-generation research completed.");
        logs.push(`[${new Date().toISOString()}] Completed pre-generation research`);
      } catch (researchError) {
        logger.error({ err: researchError }, "Fullstack Starter Kit Generator: Error during research aggregation");
        researchContext = "## Pre-Generation Research Context:\n*Error occurred during research phase.*\n\n";
        logs.push(`[${new Date().toISOString()}] Error during research: ${researchError instanceof Error ? researchError.message : String(researchError)}`);
      }
    } else {
      logger.debug('Skipping research - recommendation not requested');
      logs.push(`[${new Date().toISOString()}] Skipping research - recommendation not requested`);
    }
    
    // Ensure directories are initialized
    await initDirectories();
    
    // Step 3: Generate the final recommendation with research context if available
    const finalPrompt = `
Based SOLELY on your analysis of the use case:
${input.use_case}

${researchContext ? `And considering this additional research:\n${researchContext}\n\n` : ''}

Please provide a detailed starter kit recommendation in the following JSON format:

{
  "projectName": "example-project-name",
  "description": "A detailed description of the project",
  "techStack": {
    "frontend": {
      "name": "React",
      "version": "18.x",
      "rationale": "Explanation for this choice"
    },
    "backend": {
      "name": "Node.js",
      "version": "18.x",
      "rationale": "Explanation for this choice"
    },
    "database": {
      "name": "MongoDB",
      "version": "5.x",
      "rationale": "Explanation for this choice"
    }
    // Add other components as needed
  },
  "directoryStructure": [
    {
      "path": "/",
      "type": "directory",
      "content": null,
      "children": [
        {
          "path": "/src",
          "type": "directory",
          "content": null,
          "children": [
            {
              "path": "/src/index.js",
              "type": "file",
              "content": "console.log('Hello World');"
            }
          ]
        }
      ]
    }
  ],
  "dependencies": {
    "npm": {
      "root": {
        "dependencies": {
          "express": "^4.18.2"
        },
        "devDependencies": {
          "nodemon": "^2.0.22"
        }
      }
    }
  },
  "setupCommands": [
    "npm install",
    "npm run dev"
  ],
  "nextSteps": [
    "Configure environment variables",
    "Set up database connection"
  ]
}

**CRITICAL:** Your entire response MUST be a single, valid JSON object conforming to the schema described above. Do NOT include any explanatory text, greetings, apologies, or markdown formatting (like \`\`\`json) before or after the JSON object itself. The response should start with \`{\` and end with \`}\`.

Ensure the recommendation is comprehensive, follows best practices, and is tailored to the specific use case.
Do NOT attempt to access any external files, databases, or information sources.
`;

    const finalRecommendation = await processWithSequentialThinking(finalPrompt, config);
    logger.info(`[${new Date().toISOString()}] Received generation output from Gemini.`);
    logs.push(`[${new Date().toISOString()}] Received generation output from Gemini.`);
    
    // Process and validate the generated JSON
    let structuredDefinition: StarterKitDefinition;
    try {
        // Attempt to parse the LLM output as JSON first
        const rawJson = JSON.parse(finalRecommendation);

        // Validate the parsed JSON against the Zod schema
        const validationResult = starterKitDefinitionSchema.safeParse(rawJson);

        if (!validationResult.success) {
            // Log detailed validation errors
            logger.error({ errors: validationResult.error.issues, rawJson }, "LLM output failed schema validation");
            errors.push(`LLM output failed schema validation: ${validationResult.error.message}`);
            logs.push(`[${new Date().toISOString()}] Error: LLM output failed schema validation.`);
            
            // Return specific error
            return {
               content: [{ 
                 type: "text", 
                 text: `Error: LLM output failed validation.\nDetails: ${validationResult.error.message}\n\nEnsure the LLM strictly follows the required JSON format.` 
               }],
               isError: true
            };
        }

        // Assign validated data
        structuredDefinition = validationResult.data;
        logger.info(`[${new Date().toISOString()}] Successfully parsed and validated structured definition.`);
        logs.push(`[${new Date().toISOString()}] Successfully parsed and validated structured definition.`);

    } catch (parseError) {
        // Handle cases where the output isn't even valid JSON
        errors.push(`Failed to parse LLM output as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        logs.push(`[${new Date().toISOString()}] Error: Failed to parse LLM JSON output.`);
        logger.error({ err: parseError, rawOutput: finalRecommendation }, "LLM output was not valid JSON");
        
        return {
          content: [{ 
            type: "text", 
            text: `Error: LLM did not return valid JSON definition.\n\nRaw Output (may be truncated):\n${finalRecommendation.substring(0, 500)}...` 
          }],
          isError: true
        };
    }
    
    // Save the validated structured definition
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedName = input.use_case.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const definitionFilename = `${timestamp}-${sanitizedName}-definition.json`;
    const definitionFilePath = path.join(STARTER_KIT_DIR, definitionFilename);
    
    await fs.writeJson(definitionFilePath, structuredDefinition, { spaces: 2 });
    logger.info(`[${new Date().toISOString()}] Saved validated definition to ${definitionFilename}`);
    logs.push(`[${new Date().toISOString()}] Saved validated definition to ${definitionFilename}`);
    
    // Generate setup scripts
    logger.info(`[${new Date().toISOString()}] Generating setup scripts...`);
    let scripts: ScriptOutput = { sh: '# Error generating script', bat: 'REM Error generating script' };
    try {
      scripts = generateSetupScripts(structuredDefinition);
      logs.push(`[${new Date().toISOString()}] Generated setup scripts content.`);
    } catch (scriptError) {
      const errorMessage = scriptError instanceof Error ? scriptError.message : String(scriptError);
      errors.push(`Failed to generate setup scripts: ${errorMessage}`);
      logger.error({ err: scriptError }, "Failed to generate setup scripts content");
      logs.push(`[${new Date().toISOString()}] Error generating setup scripts: ${errorMessage}`);
    }

    // Save the generated scripts
    const scriptShFilename = `${timestamp}-${sanitizedName}-setup.sh`;
    const scriptBatFilename = `${timestamp}-${sanitizedName}-setup.bat`;
    const scriptShFilePath = path.join(STARTER_KIT_DIR, scriptShFilename);
    const scriptBatFilePath = path.join(STARTER_KIT_DIR, scriptBatFilename);

    try {
      await fs.writeFile(scriptShFilePath, scripts.sh, { mode: 0o755 }); // Make executable
      await fs.writeFile(scriptBatFilePath, scripts.bat);
      logs.push(`[${new Date().toISOString()}] Saved setup scripts: ${scriptShFilename}, ${scriptBatFilename}`);
      logger.info(`Saved setup scripts to ${STARTER_KIT_DIR}`);
    } catch (saveError) {
      const errorMessage = saveError instanceof Error ? saveError.message : String(saveError);
      errors.push(`Failed to save setup scripts: ${errorMessage}`);
      logger.error({ err: saveError }, "Failed to save setup scripts");
      logs.push(`[${new Date().toISOString()}] Error saving setup scripts: ${errorMessage}`);
    }
    
    // Format the response
    const responseText = `
# Fullstack Starter Kit Generator

## Use Case
${input.use_case}

## Project: ${structuredDefinition.projectName}
${structuredDefinition.description}

## Tech Stack
${Object.entries(structuredDefinition.techStack).map(([key, tech]) => 
  `- **${key}**: ${tech.name}${tech.version ? ` (${tech.version})` : ''} - ${tech.rationale}`
).join('\n')}

## Project Structure Generation

Setup scripts have been generated to create the project structure and install dependencies:

* **Linux/macOS Script:** \`workflow-agent-files/fullstack-starter-kit-generator/${scriptShFilename}\`
* **Windows Script:** \`workflow-agent-files/fullstack-starter-kit-generator/${scriptBatFilename}\`

To use these scripts:
1. Copy the appropriate script to an empty directory outside of this project
2. For Linux/macOS: \`chmod +x ${scriptShFilename} && ./${scriptShFilename}\`
3. For Windows: Double-click the batch file or run from command prompt

The scripts will:
- Create the project directory structure
- Generate all necessary files
- Install dependencies
- Run setup commands

## Dependencies
${JSON.stringify(structuredDefinition.dependencies, null, 2)}

## Setup Commands
${structuredDefinition.setupCommands.map(cmd => `- \`${cmd}\``).join('\n')}

## Next Steps
${structuredDefinition.nextSteps.map(step => `- ${step}`).join('\n')}

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
    logger.error({ err: error }, 'Fullstack Starter Kit Generator Error');
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

// Function replaced by performResearchQuery from researchHelper.ts
