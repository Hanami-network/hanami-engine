---
name: Bug report
about: Report a bug in the on-chain program, SDK, or CLI
title: "[BUG] "
labels: bug
assignees: ''
---

## Description

A clear and concise description of what the bug is.

## Reproduction

Steps to reproduce the behaviour:

1. Build with `anchor build`
2. Run `anchor test --skip-build`
3. See error in test `<name>`

## Expected behaviour

What you expected to happen.

## Actual behaviour

What actually happened. Include stack traces or relevant log output:

```
<paste output>
```

## Environment

- HANAMI version: (e.g. 0.4.1)
- Rust version: `rustc --version`
- Anchor version: `anchor --version`
- Solana version: `solana --version`
- OS: (e.g. Ubuntu 22.04)

## Additional context

Anything else useful: pool seeds, bloom nonce, transaction signature, etc.
