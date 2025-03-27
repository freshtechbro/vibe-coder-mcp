# Research Helper Integration in Vibe Coder MCP Tools

The `performResearchQuery` function in `src/utils/researchHelper.ts` serves as a centralized utility for deep research across multiple tools. This document outlines how each tool integrates with this research functionality.

## Common Research Helper Workflow

```mermaid
flowchart TD
    A[Tool receives input parameters] --> B[Formulate domain-specific research queries]
    B --> C[Call performResearchQuery with Perplexity model]
    C --> D{Research successful?}
    D -- Yes --> E[Aggregate research results into context block]
    D -- No --> F[Log error, continue with empty/placeholder research]
    E --> G[Combine research context with original inputs]
    F --> G
    G --> H[Call processWithSequentialThinking with Gemini model]
    H --> I[Format and return final result]
```

## 1. Research Manager Tool Flow

```mermaid
flowchart TD
    A[Receive query parameter] --> B[Initialize directories]
    B --> C[Generate filename for storing research]
    C --> D[Call performResearchQuery with perplexity/sonar-deep-research]
    D --> E[Process with Sequential Thinking to enhance research]
    E --> F[Format research with title and timestamp]
    F --> G[Save result to file]
    G --> H[Return formatted research]

    D -- Error --> I[Log error, return error message]
    E -- Error --> I
```

### Research Manager Implementation Details
- **Primary Function**: This tool's entire purpose is research
- **Research Query**: Directly uses the user's input query
- **Input → Research**: No transformation, directly passes user query 
- **Key Difference**: Uses Sequential Thinking to enhance raw research results
- **Output Format**: Formatted research document with title, content, and timestamp

## 2. PRD Generator Tool Flow

```mermaid
flowchart TD
    A[Receive productDescription parameter] --> B[Initialize directories]
    B --> C[Generate filename for storing PRD]
    C --> D[Formulate 3 research queries about market, users, and standards]
    D --> E[Call performResearchQuery for all 3 queries in parallel]
    E --> F[Aggregate research into structured context block]
    F --> G[Combine product description with research context]
    G --> H[Call processWithSequentialThinking with PRD system prompt]
    H --> I[Format PRD with title and timestamp]
    I --> J[Save PRD to file]
    J --> K[Return formatted PRD]

    E -- Error --> L[Log error, continue with partial/empty research]
    L --> F
    H -- Error --> M[Log error, return error message]
```

### PRD Generator Implementation Details
- **Research Queries**: 
  1. Market analysis and competitive landscape
  2. User needs, demographics, and expectations 
  3. Industry standards and best practices
- **Research Context Structure**: Organizes research into specific sections for the PRD generation
- **System Prompt**: Includes explicit instructions for utilizing the research context

## 3. Rules Generator Tool Flow

```mermaid
flowchart TD
    A[Receive parameters: productDescription, userStories, ruleCategories] --> B[Initialize directories]
    B --> C[Generate filename for storing rules]
    C --> D[Formulate research queries about development practices]
    D --> D1[Detect product type from description]
    D1 --> E[Call performResearchQuery for all queries in parallel]
    E --> F[Aggregate research into structured context block]
    F --> G[Combine inputs with research context]
    G --> H[Call processWithSequentialThinking with rules system prompt]
    H --> I[Format rules with title and timestamp]
    I --> J[Save rules to file]
    J --> K[Return formatted rules]

    E -- Error --> L[Log error, continue with partial/empty research]
    L --> F
    H -- Error --> M[Log error, return error message]
```

### Rules Generator Implementation Details
- **Research Queries**: 
  1. Best development practices and coding standards
  2. Specific rules or common categories (based on input)
  3. Architecture patterns for detected product type
- **Smart Detection**: Analyzes product description to detect type (web, mobile, API, game, etc.)
- **Conditional Query**: Second query varies based on provided rule categories

## 4. User Stories Generator Tool Flow

```mermaid
flowchart TD
    A[Receive productDescription parameter] --> B[Initialize directories]
    B --> C[Generate filename for storing user stories]
    C --> D[Formulate 3 research queries about personas, workflows, and pain points]
    D --> E[Call performResearchQuery for all 3 queries in parallel]
    E --> F[Aggregate research into structured context block]
    F --> G[Combine product description with research context]
    G --> H[Call processWithSequentialThinking with user stories system prompt]
    H --> I[Format user stories with title and timestamp]
    I --> J[Save user stories to file]
    J --> K[Return formatted user stories]

    E -- Error --> L[Log error, continue with partial/empty research]
    L --> F
    H -- Error --> M[Log error, return error message]
```

### User Stories Generator Implementation Details
- **Research Queries**: 
  1. User personas and stakeholders
  2. Common user workflows and use cases
  3. User experience expectations and pain points
- **System Prompt**: Specifically instructs to pay attention to "User Personas & Stakeholders" and "User Workflows & Use Cases" sections

## 5. Task List Generator Tool Flow

```mermaid
flowchart TD
    A[Receive parameters: productDescription, userStories] --> B[Initialize directories]
    B --> C[Generate filename for storing task list]
    C --> D[Formulate 3 research queries about lifecycle, estimation, and team structure]
    D --> E[Call performResearchQuery for all 3 queries in parallel]
    E --> F[Aggregate research into structured context block]
    F --> G[Combine inputs with research context]
    G --> H[Call processWithSequentialThinking with task list system prompt]
    H --> I[Format task list with title and timestamp]
    I --> J[Save task list to file]
    J --> K[Return formatted task list]

    E -- Error --> L[Log error, continue with partial/empty research]
    L --> F
    H -- Error --> M[Log error, return error message]
```

### Task List Generator Implementation Details
- **Research Queries**: 
  1. Development lifecycle tasks and milestones
  2. Task estimation and dependency management best practices
  3. Team structures and work breakdown patterns
- **Inputs Combination**: Merges both product description and user stories with research
- **System Prompt**: Focuses on "Development Lifecycle & Milestones" and "Task Estimation & Dependencies" sections

## 6. Fullstack Starter Kit Generator Tool Flow

```mermaid
flowchart TD
    A[Receive parameters] --> B{Request recommendation?}
    B -- No --> N[Skip research phase]
    B -- Yes --> C[Log research start]
    C --> D[Formulate 3 research queries about tech stacks, architecture, and tooling]
    D --> E[Call performResearchQuery for all 3 queries in parallel]
    E --> F[Aggregate research into structured context block]
    F --> G[Initialize directories]
    G --> H[Generate final prompt with research context]
    N --> G
    N --> H1[Generate final prompt without research]
    H1 --> I
    H --> I[Call processWithSequentialThinking for JSON generation]
    I --> J[Validate JSON against schema]
    J -- Valid --> K[Generate setup scripts]
    K --> L[Save definition and scripts]
    L --> M[Return formatted response]

    E -- Error --> O[Log error, continue with empty research]
    O --> F
    I -- Error --> P[Return JSON parsing error]
    J -- Invalid --> Q[Return validation error]
    K -- Error --> R[Log script error, continue with response]
```

### Fullstack Starter Kit Generator Implementation Details
- **Conditional Research**: Only performs research if `request_recommendation` is true
- **Research Queries**: 
  1. Technology stack recommendations
  2. Best practices and architectural patterns
  3. Modern development tooling and libraries
- **Structured Output**: Generates JSON that must validate against schema
- **Additional Processing**: Generates setup scripts from validated definition
- **Complex Flow**: Most complex integration with additional validation steps

## Key Observations

1. **Common Pattern**: All tools follow the same general pattern of using `performResearchQuery` for pre-generation research
2. **Parallel Execution**: Most tools execute multiple research queries in parallel for efficiency
3. **Error Handling**: All implementations gracefully handle research failures
4. **Model Specialization**: 
   - `performResearchQuery` consistently uses `perplexity/sonar-deep-research` for deep research
   - All tools then use `processWithSequentialThinking` with `gemini-2.0-flash-001` for generation
5. **Research Context Usage**: Each tool has specialized system prompts with instructions on how to use the research context

## Implementation Sophistication

| Tool                        | # Research Queries | Conditional Logic | Output Format |
|-----------------------------|--------------------|-------------------|---------------|
| Research Manager            | 1                  | No                | Markdown      |
| PRD Generator               | 3                  | No                | Markdown      |
| Rules Generator             | 3                  | Yes               | Markdown      |
| User Stories Generator      | 3                  | No                | Markdown      |
| Task List Generator         | 3                  | No                | Markdown      |
| Fullstack Starter Kit Gen.  | 3                  | Yes               | JSON + Scripts|
