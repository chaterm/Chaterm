# Chaterm Contributing Guide

We warmly welcome your contributions! This guide will help you understand how to effectively contribute to the Chaterm project.

## Ways to Contribute

- 🐛 **Report Bugs** - Help us identify and fix issues
- 💬 **Discuss Code** - Participate in technical discussions
- 🔧 **Submit Fixes** - Fix bugs and improve existing features
- ✨ **Propose Features** - Suggest new features
- 📖 **Improve Documentation** - Enhance documentation and guides
- 🧪 **Add Tests** - Improve test coverage

We use GitHub to host code, track issues and feature requests, and accept Pull Requests.

### Contributor Workflow

1. Fork this repository to your personal account
2. Create your development branch from the `main` branch
3. Develop in your forked repository
4. Submit a Pull Request to the `main` branch of the original repository when done
5. Mention the fixed Issue in the PR description (if applicable)
6. After approval from at least one maintainer, the PR will be merged

## Local Development Environment Setup

1. Clone the repository:

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/Chaterm.git
cd Chaterm
```

2. Install necessary development tools:
   - Install [Node.js](https://nodejs.org/) (recommended to use the latest LTS version)

3. Install Electron:

   ```bash
   npm i electron -D
   ```

4. Install project dependencies:

   ```bash
   node scripts/patch-package-lock.js
   npm install
   ```

5. Start the development server:

```bash
npm run dev
```

## Project Structure

```
Chaterm/
├── src/
│   ├── main/          # Electron main process
│   ├── preload/       # Preload scripts
│   └── renderer/      # Vue.js frontend
├── scripts/           # Build and development scripts
├── resources/         # Application resources (icons, etc.)
├── tests/            # Test files
└── docs/             # Documentation
```

## Code Quality Standards

### Code Style

- **ESLint**: JavaScript/TypeScript code checking
- **Prettier**: Code formatting
- **TypeScript**: Strong typing recommended

### Quality Checks

```bash
# Format code
npm run format

# Check for code issues
npm run lint

# Build verification
npm run build
```

### Commit Messages

Use conventional commit format:

```
feat: add new feature
fix: fix bug in component
docs: update README
refactor: improve code structure
test: add unit tests
```

## Getting Help

- 📝 **Documentation**: Check existing documentation first
- 💬 **Discussions**: Use GitHub Discussions to ask questions
- 🐛 **Issues**: Report bugs through issues with detailed information
- 💡 **Ideas**: Propose feature suggestions through issues

## Questions?

If you have any questions about contributing, please create an issue using the "question" label.

## License

By contributing to Chaterm, you agree that your contributions will be licensed under the same terms as the project.
