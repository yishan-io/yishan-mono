# Defense In Depth

After finding a root cause, add validation at the important layers the bad data crosses.

## Core Principle

Do not rely on one check if the failure can travel through multiple layers.

Aim to make the bug hard or impossible to repeat.

## Typical Layers

### 1. Entry Validation

Reject obviously invalid input at the API or function boundary.

### 2. Business Logic Validation

Check assumptions again at the layer that performs the sensitive operation.

### 3. Environment Guards

Prevent dangerous actions in special contexts like tests, CI, or migration mode.

### 4. Diagnostic Instrumentation

Capture enough context that future failures are easier to explain.

## Why Multiple Layers Help

Different paths can bypass different checks.

Layered validation helps when:

- new call sites appear later
- mocks or tests bypass normal flow
- environment-specific behavior changes the risk
- future refactors weaken one guard without removing the others

## Practical Rule

After fixing a root cause, ask:

1. where should this invalid state have been rejected?
2. what operation should defend itself even if earlier checks fail?
3. what environment guard would prevent the worst-case outcome?

Then add only the guards that meaningfully reduce risk.
