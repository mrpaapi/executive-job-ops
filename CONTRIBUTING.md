# Contributing to executive-job-ops

Thank you for helping people find jobs. Every contribution matters.

## Ways to contribute

- **Bug reports** — Open an issue describing what happened and what you expected
- **Feature ideas** — Open an issue with the "enhancement" label
- **Code** — Fork, branch, code, PR (see below)
- **Translations** — The UI isn't yet translated — help wanted
- **Testing** — Try it on different OS/resume types and report issues

## Code contribution workflow

```bash
# 1. Fork on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/executive-job-ops.git
cd executive-job-ops

# 2. Create a branch
git checkout -b feature/your-feature-name

# 3. Set up dev environment
cp .env.example .env   # add your OpenAI key
./install.sh

# 4. Make changes, then start the app
./start.sh

# 5. Commit with a clear message
git commit -m "feat: add salary negotiation scripts to prep page"

# 6. Push and open a Pull Request
git push origin feature/your-feature-name
```

## Commit message convention

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `style:` formatting, no logic change
- `refactor:` code restructure
- `chore:` tooling, dependencies

## Project principles

1. **Zero-config for end users** — dropping a PDF should just work
2. **Works offline** — local LLM support must be maintained
3. **Privacy first** — resumes never leave the machine except for AI calls
4. **Accessible** — someone with no tech background should be able to use it

## Questions?

Open an issue or reach out via GitHub: [@srinathsankara](https://github.com/srinathsankara)
