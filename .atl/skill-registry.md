# Skill Registry — ordermanager-plugin

Generated: 2026-06-04 | Mode: engram | Project: ordermanager-plugin

## Project Conventions

- **AGENTS.md** (user-level): `C:\Users\Usuario\.config\opencode\AGENTS.md` — 300-line file limit, no AI attribution in commits, conventional commits, no build after changes, rioplatense Spanish.

## Available Skills

### agno-agent
- **Trigger**: agno, agent runtime, build agent, delegate to agent, web search, code analysis
- **Path**: `C:\Users\Usuario\.config\opencode\skills\agno-agent\SKILL.md`
- **Rules**: Create Agno agents as MCP tools; code_analyze for bug/security/perf review; web_search via DuckDuckGo; python_exec in sandbox.

### branch-pr
- **Trigger**: creating, opening, preparing PRs, pull requests
- **Path**: `C:\Users\Usuario\.config\opencode\skills\branch-pr\SKILL.md`
- **Rules**: Issue-first workflow; create PR with gh CLI; conventional commits; review all commits not just latest.

### chained-pr
- **Trigger**: PRs over 400 lines, stacked PRs, review slices
- **Path**: `C:\Users\Usuario\.config\opencode\skills\chained-pr\SKILL.md`
- **Rules**: Split oversized changes into chained PRs; each PR reviewable independently; protect review focus.

### cognitive-doc-design
- **Trigger**: writing guides, READMEs, RFCs, onboarding, architecture, review-facing docs
- **Path**: `C:\Users\Usuario\.config\opencode\skills\cognitive-doc-design\SKILL.md`
- **Rules**: Design docs that reduce cognitive load; follow structured format.

### comment-writer
- **Trigger**: PR feedback, issue replies, reviews, Slack, GitHub comments
- **Path**: `C:\Users\Usuario\.config\opencode\skills\comment-writer\SKILL.md`
- **Rules**: Write warm, direct collaboration comments; constructive tone.

### customize-opencode
- **Trigger**: editing opencode config, agents, skills, plugins, MCP servers, permission rules
- **Path**: built-in
- **Rules**: Only use for opencode configuration files, not user application code.

### issue-creation
- **Trigger**: creating GitHub issues, bug reports, feature requests
- **Path**: `C:\Users\Usuario\.config\opencode\skills\issue-creation\SKILL.md`
- **Rules**: Issue-first checks; conventional format; clear reproduction steps for bugs.

### judgment-day
- **Trigger**: judgment day, dual review, adversarial review, juzgar
- **Path**: `C:\Users\Usuario\.config\opencode\skills\judgment-day\SKILL.md`
- **Rules**: Run blind dual review; fix confirmed issues; re-judge after fixes.

### lessons-learned
- **Trigger**: learned, lessons learned, aprendido, aprendizaje, recordar aprendizajes
- **Path**: `C:\Users\Usuario\.config\opencode\skills\lessons-learned\SKILL.md`
- **Rules**: Domain router for Obsidian plugin gotchas, TypeScript patterns, exchange rates, UX naming, and opencode config. Check domain files BEFORE implementing to avoid repeating documented bugs. Key domains: obsidian.md, typescript.md, exchange.md, ux.md, opencode.md.

### model-router
- **Trigger**: modelo, model routing, qué modelo usar, MiMo, Deepseek, switch model
- **Path**: `C:\Users\Usuario\.config\opencode\skills\model-router\SKILL.md`
- **Rules**: Route tasks to optimal AI model with graceful fallback chains.

### skill-creator
- **Trigger**: new skills, agent instructions, documenting AI usage patterns
- **Path**: `C:\Users\Usuario\.config\opencode\skills\skill-creator\SKILL.md`
- **Rules**: Create LLM-first skills with valid frontmatter; Activation Contract + Hard Rules + Decision Gates + Execution Steps + Output Contract + References.

### skill-curator
- **Trigger**: curator, curate skills, review skills, archive skills, improve skills, skill maintenance
- **Path**: `C:\Users\Usuario\.config\opencode\skills\skill-curator\SKILL.md`
- **Rules**: Manage skill lifecycle; user-authorized tracking; archiving; self-improvement.

### work-unit-commits
- **Trigger**: implementation, commit splitting, chained PRs, keeping tests with code
- **Path**: `C:\Users\Usuario\.config\opencode\skills\work-unit-commits\SKILL.md`
- **Rules**: Commit by work unit (deliverable behavior), not by file type; keep tests with code; keep docs with user-visible change; tell a story; conventional commits; if >400 lines, group into chained PR candidates.
