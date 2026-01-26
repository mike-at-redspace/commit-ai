# commit-ai

> Let AI write your commit messages. Because life's too short to stare at `git commit` thinking "how do I describe this mess?"

Ever been stuck at your terminal for five minutes trying to come up with the perfect commit message? Or worse, ended up with "fix stuff" or "updates" because you just wanted to move on with your life? Yeah, me too.

**commit-ai** uses GitHub Copilot to analyze your staged changes and generate proper, conventional commit messages that actually make sense. It looks at your diff, understands what you're doing (often better than you do at 2am), and writes a commit message that your future self will actually appreciate.

## Why This Exists

We've all been there: you just spent 40 minutes implementing a feature, and now you have to context-switch to "commit message mode" and explain what you did. Your brain is already moving on to the next task, but git is sitting there waiting for you to write a novel.

That's where commit-ai comes in. It reads your diff, figures out the intent behind your changes, and generates commit messages that follow best practices - conventional commits, proper scopes, the whole nine yards. You can accept it as-is, edit it, or ask for a different style. No more "fix bug" commits.

## Prerequisites

You'll need a **GitHub Copilot subscription** (Individual, Business, or Enterprise) and the Copilot CLI installed. If you're already using Copilot in your editor, you're most of the way there.

Install the CLI:

```bash
npm install -g @github/copilot-cli
```

Then authenticate (this pops open a browser):

```bash
copilot auth
```

## Installation

Clone this repo (or wherever you keep it), install dependencies, and link it globally:

```bash
cd cli-tools/commit-ai
npm install
npm link  # Makes 'commit-ai' available as a global command
```

Now `commit-ai` works from anywhere in your terminal. Magic.

## Usage

The basic flow is dead simple:

```bash
# Stage your changes like usual
git add .

# Let AI write your commit message
commit-ai
```

That's it. The tool analyzes your diff, generates a message, and lets you commit, edit, regenerate, or bail.

### Common Workflows

```bash
# Stage everything and generate in one go
commit-ai --all

# Preview the message without actually committing
commit-ai --dry-run

# See which files are being committed
commit-ai --explain

# Get more details about what's happening
commit-ai --verbose
```

### Git Alias (Highly Recommended)

Add this to your `~/.gitconfig` and thank me later:

```ini
[alias]
    msg = !commit-ai
```

Now you can just do `git msg` and you're off to the races.

### Shell Alias (Also Great)

Throw these in your `~/.zshrc`:

```bash
alias gm="commit-ai"
alias gma="commit-ai --all"
```

I use `gma` approximately 47 times a day.

## The Interactive Flow

After analyzing your changes, you get an interactive prompt:

```
Suggested commit message:

feat(button): add loading and disabled states

- Adds spinner support for async actions  
- Prevents duplicate clicks during submission
- Improves UX for form submissions

? What would you like to do?
❯ Commit with this message
  Edit message before committing
  Regenerate message
  Cancel
```

**Commit** - Accepts as-is and commits. Fast path for when the AI nailed it.

**Edit** - Opens your default editor so you can tweak the message. Maybe you want to add more context or fix a detail.

**Regenerate** - Asks the AI for a different take. You can request more detail, more conciseness, or just roll the dice again.

**Cancel** - Bails out without committing. Your staged changes stay staged.

## CLI Options

| Flag            | Description                                 |
| --------------- | ------------------------------------------- |
| `-a, --all`     | Stage all changes before generating message |
| `-d, --dry-run` | Generate message but don't actually commit  |
| `-e, --explain` | Show which files are being committed        |
| `-v, --verbose` | Extra output for debugging                  |
| `--init`        | Print out a config template                 |

## Configuration

Create a `.commit-ai.json` file in your project root or home directory:

```json
{
  "model": "gpt-4o",
  "conventionalCommit": true,
  "includeScope": true,
  "includeEmoji": false,
  "maxSubjectLength": 72,
  "verbosity": "normal"
}
```

### Config Options Explained

| Option               | Default  | What It Does                                                                                           |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `model`              | `gpt-4o` | Which Copilot model to use. Stick with 4o unless you have a reason not to.                             |
| `conventionalCommit` | `true`   | Use conventional commits format (`feat:`, `fix:`, etc). Turn off if your team doesn't use it.          |
| `includeScope`       | `true`   | Include scope in commits (`feat(auth): ...`). Helps organize changes by area.                          |
| `includeEmoji`       | `false`  | Prefix commits with emoji (✨, 🐛, etc). Fun but controversial.                                          |
| `maxSubjectLength`   | `72`     | Keep subjects under this length. 72 is the git standard.                                               |
| `verbosity`          | `normal` | How detailed the body should be: `minimal` (subject only), `normal`, or `detailed` (full explanation). |

You can also override the model with an environment variable:

```bash
export COMMIT_AI_MODEL=gpt-4
```

## Real-World Examples

Here's what commit-ai generates for typical changes:

**Scenario: You added a React hook**
```
feat(hooks): add useAuth hook for session management

- Centralizes auth state and token refresh logic
- Exposes login, logout, and session check methods  
- Automatically refreshes tokens before expiry
```

**Scenario: You fixed a TypeScript error**
```
fix(types): correct return type for getUserData

Previously returned Promise<User | null> but actually returns Promise<User>
```

**Scenario: You updated Tailwind classes**
```
style(button): update spacing and hover states

- Increases padding for better touch targets
- Adds smooth transition on hover
- Uses theme colors instead of hardcoded values
```

**Scenario: You refactored a messy component**
```
refactor(profile): extract user info into separate component

Improves reusability and reduces ProfileCard complexity
```

The AI looks at your file paths, understands modern web dev patterns (React components, API routes, styling), and writes messages that actually describe what's happening.

## Troubleshooting

### "Copilot authentication failed"

Run `copilot auth` and make sure you complete the browser flow. You need an active Copilot subscription.

### "No staged changes found"

You forgot to `git add` your files. Stage something first, or use `commit-ai --all` to stage everything.

### The generated message is way off

Try regenerating with "more detailed" or "more concise" - sometimes a different verbosity level helps. You can also just edit it manually.

### It's truncating my diff

If you have massive changes (like dependency lockfiles), the tool truncates the diff to avoid hitting token limits. The AI focuses on what it can see. Consider committing in smaller chunks.

## How It Works

1. **Checks for staged changes** - Uses `git diff --staged` to see what you're about to commit
2. **Gathers context** - Pulls your recent commits and current branch name to understand your style
3. **Sends to Copilot** - Passes the diff and context to GitHub's AI with a carefully crafted system prompt
4. **Parses the response** - Extracts the commit message, type, and scope
5. **Formats output** - Applies your config preferences (emoji, scope, length limits)
6. **Interactive loop** - Lets you commit, edit, regenerate, or cancel

The AI is taught to focus on *intent* over mechanics. It tries to answer "why did this change happen?" instead of just listing files that changed.

## Tips for Best Results

- **Use descriptive branch names** - `feat/oauth-login` gives better context than `asdf`
- **Commit related changes together** - The AI does better with cohesive diffs
- **Keep your recent commits clean** - The tool learns from your style
- **Adjust verbosity per commit** - Use minimal for tiny tweaks, detailed for complex features
- **Edit when needed** - The AI is good but not psychic. Add context it can't infer from code.

## FAQ

**Q: Does this send my code to GitHub?**  
A: Yes, it sends your git diff to Copilot's API (same as when you use Copilot in your editor). If you're working on private repos with sensitive code, be aware of that.

**Q: Can I use this without Copilot?**  
A: Nope, it requires an active GitHub Copilot subscription and the CLI. That's the whole point.

**Q: Will this work with my team's commit conventions?**  
A: Probably! The tool uses conventional commits by default, but you can disable that. The AI also learns from your recent commits, so it picks up team patterns.

**Q: What if I want to customize the AI's behavior?**  
A: Check out the system prompt in [src/ai.ts](src/ai.ts) - that's where the magic happens. You can fork this repo and tweak it to match your needs.

**Q: Does it handle breaking changes or footers?**  
A: Not automatically yet. For breaking changes, use the edit option and add `BREAKING CHANGE:` to the body manually.

## License

MIT - Do whatever you want with it.

---

Built with ☕ and frustration at writing commit messages manually. If this saved you time, consider it karmic debt repaid to all the open source tools that save *you* time every day.
