# Fullstack Starter Kit Generator (`generate-fullstack-starter-kit`)

## Overview

Generates full-stack project starter kits with custom tech stacks. This tool leverages Large Language Models (LLMs) via OpenRouter to perform its task.

## Inputs

This tool accepts the following parameters via the MCP call:

| Parameter                  | Type                      | Description                                          | Required |
| -------------------------- | ------------------------- | ---------------------------------------------------- | -------- |
| `use_case`                 | `string`                  | The specific use case for the starter kit            | Yes      |
| `tech_stack_preferences`   | `Record<string, string>`  | Optional tech stack preferences                      | No       |
| `request_recommendation`   | `boolean`                 | Whether to request recommendations for tech stack    | No       |
| `include_optional_features`| `string[]`                | Optional features to include in the starter kit      | No       |

*(Based on the Zod schema defined in `src/server.ts`)*

## Outputs

* **Primary Output:** A structured JSON definition specifying the starter kit's configuration.
* **File Storage:** Multiple artifacts are saved:
  * JSON Definition: `workflow-agent-files/fullstack-starter-kit-generator/[timestamp]-[sanitized-name]-definition.json`
  * Shell Script: `workflow-agent-files/fullstack-starter-kit-generator/[timestamp]-[sanitized-name]-setup.sh`
  * Batch Script: `workflow-agent-files/fullstack-starter-kit-generator/[timestamp]-[sanitized-name]-setup.bat`
* **MCP Response:** A formatted report of the generated starter kit configuration.

## Workflow

When invoked, this tool performs the following steps:

1. **Input Validation:** The incoming parameters are validated.
2. **Initial Analysis:** Performs an initial analysis of the use case and tech stack preferences.
3. **Research Phase (Pre-Generation):**
   * If `request_recommendation` is true:
     * Formulates three specific queries based on the use case:
       * Latest technology stack recommendations
       * Best practices and architectural patterns
       * Modern development tooling and libraries
     * Executes these queries in parallel using the configured Perplexity model (`perplexity/sonar-deep-research` via `performResearchQuery`).
     * Aggregates the research results into a structured context block.
4. **JSON Generation Phase:**
   * Calls the `processWithSequentialThinking` function with a prompt that includes the research context if available.
   * This internally uses the configured Gemini model (`google/gemini-2.0-flash-001`) to generate a structured JSON definition.
5. **JSON Validation:**
   * Parses the generated JSON output.
   * Validates it against the `starterKitDefinitionSchema` (Zod schema).
   * If validation fails, returns a detailed error response.
6. **Setup Script Generation:**
   * Generates shell and batch scripts based on the validated JSON definition.
   * These scripts create the project structure, files, and install dependencies.
7. **Output Saving:**
   * Saves the validated JSON definition and both scripts to the filesystem.
8. **Response:** Returns a formatted report of the generated starter kit.

### Workflow Diagram (Mermaid)

```mermaid
flowchart TD
    A[Start Tool: generate-fullstack-starter-kit] --> B{Input Params Valid?};
    B -- No --> BN[Return Error Response];
    B -- Yes --> C[1. Perform Initial Analysis w/ Gemini];
    C --> D{Research Requested?};
    
    D -- Yes --> E[2a. Call performResearchQuery (Perplexity)];
    D -- No --> F[3. Assemble Main Prompt w/o Research];
    
    E --> F2[2b. Assemble Main Prompt w/ Research Context];
    F2 --> G2[4. Call processWithSequentialThinking (Gemini)];
    F --> G[4. Call processWithSequentialThinking (Gemini)];
    
    G2 --> H[5. Parse & Validate JSON Output];
    G --> H;
    
    H -- Valid --> I[6. Generate Setup Scripts (SH & BAT)];
    H -- Invalid --> HE[Return Validation Error];
    
    I --> J[7. Save Definition JSON & Scripts];
    J --> K[8. Return Formatted Response via MCP];
    
    E -- Error --> EE[Log Research Error, Continue w/o Context];
    EE --> F2;
```

## Usage Example

From an MCP client (like Claude Desktop):

```
Generate a fullstack starter kit for a real estate listing website with user authentication, property search, and favoriting features. I prefer React on the frontend and Node.js with Express on the backend, but would like recommendations for other components.
```

## JSON Schema & Scripts

The tool generates a structured definition conforming to a Zod schema (`schema.ts`), which is then used to generate setup scripts (`scripts.ts`). The schema includes:

* `projectName`: Project identifier
* `description`: Detailed project description
* `techStack`: Technology choices with rationale
* `directoryStructure`: Complete file/folder organization
* `dependencies`: Package dependencies by directory
* `setupCommands`: Commands to initialize the project
* `nextSteps`: Follow-up actions after setup

The generated setup scripts (shell and batch) create the defined directory structure, write all files with appropriate content, install dependencies, and run specified setup commands.

## Error Handling

* Handles invalid input parameters.
* Attempts to gracefully handle failures during the research phase.
* Provides detailed validation errors for invalid JSON output.
* Handles script generation failures.
* Handles file saving errors.
* Returns specific error messages via MCP response when failures occur.
