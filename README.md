# commit-ai

> Let AI write your commit messages. Because life's too short to stare at `git commit` thinking "how do I describe this mess?"

**commit-ai** uses GitHub Copilot to turn your staged diff into proper conventional commit messages. You get a terminal dashboard: suggested message streams in, then you commit, regenerate (with different style or a custom instruction), or cancel.

## Prerequisites

- **Node.js 25+**
- **GitHub Copilot** subscription and the Copilot CLI

```bash
npm install -g @github/copilot-cli
copilot auth
```

## Installation

```bash
cd commit-ai
pnpm install
pnpm link --global
```

Then run `commit-ai` from any repo.

## Usage

```bash
git add .
commit-ai
```

Interactive mode shows a dashboard: branch, file count, streaming message in a bordered card, and an action menu (Commit, Regenerate, Cancel). Regenerate lets you pick same/detailed/minimal style or type a custom instruction.

### Flags

| Flag                              | Description                              |
| --------------------------------- | ---------------------------------------- |
| `-a, --all`                       | Stage all changes, then generate         |
| `-d, --dry-run`                   | Generate message only, no commit         |
| `-e, --explain`                   | List files being committed               |
| `-v, --verbose`                   | Extra debug output                       |
| `-y, --yes`                       | Commit with generated message, no prompt |
| `-s, --style <detailed\|minimal>` | Override message style                   |
| `--init`                          | Print config template                    |

Non-interactive (`-y` or `-d`) skips the Ink UI and prints the message to stdout.

## Configuration

Put `.commit-ai.json` in your project root or home dir:

```json
{
  "model": "grok-code-fast-1",
  "conventionalCommit": true,
  "includeScope": true,
  "includeEmoji": false,
  "maxSubjectLength": 72,
  "verbosity": "normal"
}
```

- **model** – Copilot model (override with `COMMIT_AI_MODEL`).
- **conventionalCommit** – Use `feat:`, `fix:`, etc.
- **includeScope** – e.g. `feat(auth):`.
- **includeEmoji** – Prefix with ✨, 🐛, etc.
- **verbosity** – `minimal` | `normal` | `detailed`.

## Tips

- Use descriptive branch names; the AI uses branch + recent commits for style.
- Commit coherent chunks so the diff tells a clear story.
- When the message is close but not perfect, use **Regenerate** with a custom instruction to tweak it.

## FAQ

**Does this send my code to GitHub?**  
Yes. It sends your staged diff to Copilot, same as Copilot in your editor.

**Can I use it without Copilot?**  
No. It depends on the Copilot CLI and an active subscription.

**Breaking changes / footers?**  
Use Regenerate with a custom instruction (e.g. "add BREAKING CHANGE: ...") or commit with `-y` and amend the message with `git commit --amend`.

## License

MIT.
