# Coding Standards

## Function Syntax

Prefer `function` declarations over arrow functions assigned to variables:

```typescript
// Preferred
function processData(input: string): string {
  return input.trim();
}

// Avoid
const processData = (input: string): string => {
  return input.trim();
};
```

## Helper Function Placement

Place helper functions below their first usage and rely on hoisting. Main logic at top:

```typescript
// Main export or entry point first
export function main(): void {
  const result = helperFunction();
  console.log(result);
}

// Helper functions below
function helperFunction(): string {
  return "helper result";
}
```

## No Comments

Do not leave comments in code. Use descriptive method and variable names instead.

## Classes Over Helpers

Encapsulate related logic in classes with private methods instead of standalone helpers.

## Nullable Over Optional

Avoid optional fields in types/interfaces. Type the field explicitly as nullable:

```typescript
// Preferred
interface Config {
  value: string | null;
}

// Avoid
interface Config {
  value?: string;
}
```

## New Classes in Separate Files

Place each class in its own file. Do not embed new class declarations in large modules.
