FROM mcr.microsoft.com/devcontainers/typescript-node:latest

USER node
ENV PATH="/home/node/.local/bin:${PATH}"
RUN curl -fsSL https://claude.ai/install.sh | bash
RUN claude plugin marketplace add akilin/claude-plugins
RUN claude plugin install better-tool-rows@akilin-plugins
