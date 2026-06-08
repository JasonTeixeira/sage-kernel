# Template Engine

The template engine turns catalog templates into project starter plans and filesystem skeletons.

This phase intentionally starts with a dependency-free scaffold engine. Later phases can replace the placeholder files with full Next.js, FastAPI, Expo, Docker, CI/CD, and infra templates.

## Commands

List templates:

```bash
npm run template:list
```

Scaffold a project skeleton:

```bash
npm run template:scaffold -- --template next-saas-app --name acme-dispatch
```

Default output:

```text
generated/<project-name>/
```

