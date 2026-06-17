# Install and Upgrade

## Local Install

```bash
git clone <repo-url> sage-kernel
cd sage-kernel
npm install
npm link
sage doctor
```

## Private Install From Git

```bash
npm install -g git+ssh://git@github.com/JasonTeixeira/sage-kernel.git
```

Do not publish publicly until the security model, CI, and release process are mature.

## Upgrade

```bash
cd sage-kernel
git pull
npm install
npm link
sage doctor
```

## Release Packaging

Dry-run:

```bash
npm run release:pack
```
