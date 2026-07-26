# Root-Cause Tracing

Use this when an error shows up deep in the stack but the real problem started earlier.

## Core Principle

Trace backward through the call chain until you find the original trigger.

Do not fix only the place where the error finally appeared.

## Process

1. Observe the visible symptom
2. Find the immediate code path that throws, fails, or misbehaves
3. Ask what called that code and what input it passed
4. Keep tracing upward until you find where the invalid state or value originated
5. Fix the source, not only the final failure site

## Useful Instrumentation

When tracing manually is difficult, log:

- the suspicious input value
- the current environment or state
- the call site context
- a stack trace if available

In tests, prefer direct console output if higher-level logging is suppressed.

## Why This Matters

Deep-stack symptoms are often caused by:

- invalid input passed earlier
- bad initialization order
- hidden shared state
- wrong default values
- environment propagation mistakes

The deeper failure is often only where the system finally notices the bug.

## Follow-Up

After fixing the source, consider adding layered validation so the same bad state is caught earlier next time. See `defense-in-depth.md`.
