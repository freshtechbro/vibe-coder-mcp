#!/bin/bash
# Setup script for Vibe Coder MCP Server

echo "Setting up Vibe Coder MCP Server..."
echo "=================================================="

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed. Please install Node.js and npm first."
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Create workflow directories
echo "Creating workflow directories..."
mkdir -p workflow-agent-files/research-manager
mkdir -p workflow-agent-files/rules-generator
mkdir -p workflow-agent-files/prd-generator
mkdir -p workflow-agent-files/user-stories-generator
mkdir -p workflow-agent-files/task-list-generator

# Build TypeScript
echo "Building TypeScript..."
npm run build

# Check if .env file exists, create if not
if [ ! -f .env ]; then
    echo "Creating default .env file..."
    cat > .env << EOF
# OpenRouter Configuration
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
GEMINI_MODEL=google/gemini-2.0-flash-001
PERPLEXITY_MODEL=perplexity/sonar-deep-research

# Server Configuration
EOF
    echo "Please edit .env file to add your OpenRouter API key."
fi

echo ""
echo "Setup complete!"
echo "=================================================="
echo "IMPORTANT: Before running the server, you need to:"
echo "1. Edit .env file to add your OpenRouter API key"
echo "2. Run the server with: npm start"
echo "3. To use with Claude Desktop, add the config from mcp-config.json to your Claude MCP settings"
echo ""
