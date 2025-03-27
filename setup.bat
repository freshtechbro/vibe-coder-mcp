@echo off
REM Setup script for Vibe Coder MCP Server

echo Setting up Vibe Coder MCP Server...
echo ==================================================

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed. Please install Node.js and npm first.
    exit /b 1
)

REM Install dependencies
echo Installing dependencies...
call npm install

REM Create workflow directories
echo Creating workflow directories...
if not exist workflow-agent-files\research-manager mkdir workflow-agent-files\research-manager
if not exist workflow-agent-files\rules-generator mkdir workflow-agent-files\rules-generator
if not exist workflow-agent-files\prd-generator mkdir workflow-agent-files\prd-generator
if not exist workflow-agent-files\user-stories-generator mkdir workflow-agent-files\user-stories-generator
if not exist workflow-agent-files\task-list-generator mkdir workflow-agent-files\task-list-generator

REM Build TypeScript
echo Building TypeScript...
call npm run build

REM Check if .env file exists, create if not
if not exist .env (
    echo Creating default .env file...
    (
        echo # OpenRouter Configuration
        echo OPENROUTER_API_KEY=your_openrouter_api_key_here
        echo OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
        echo GEMINI_MODEL=google/gemini-1.5-pro-latest
        echo PERPLEXITY_MODEL=perplexity/sonar-small-online
        echo.
        echo # Server Configuration
        echo PORT=3000
    ) > .env
    echo Please edit .env file to add your OpenRouter API key.
)

echo.
echo Setup complete!
echo ==================================================
echo IMPORTANT: Before running the server, you need to:
echo 1. Edit .env file to add your OpenRouter API key
echo 2. Run the server with: npm start
echo 3. To use with Claude Desktop, add the config from mcp-config.json to your Claude MCP settings
echo.
