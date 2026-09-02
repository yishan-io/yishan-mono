const MIN_PREFIX_LENGTH = 3;
const MAX_PREFIX_LENGTH = 5;
const ALPHABET_SIZE = 26;
const COLLISION_SUFFIX_LENGTH = 2;
const COLLISION_CANDIDATE_COUNT = ALPHABET_SIZE ** COLLISION_SUFFIX_LENGTH;
const FALLBACK_PREFIX = "PRJ";
const RESERVED_PREFIX = "PERS";

function buildPrefixSeed(projectName: string): string {
  const letters = projectName.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length >= MIN_PREFIX_LENGTH) {
    return letters.slice(0, MAX_PREFIX_LENGTH);
  }

  return `${letters}${FALLBACK_PREFIX}`.slice(0, MIN_PREFIX_LENGTH);
}

function calculateStableHash(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function buildCollisionSuffix(value: number): string {
  const normalized = value % COLLISION_CANDIDATE_COUNT;
  const first = Math.floor(normalized / ALPHABET_SIZE);
  const second = normalized % ALPHABET_SIZE;
  return String.fromCharCode(65 + first, 65 + second);
}

/** Builds the deterministic task-prefix candidates used to backfill legacy projects. */
export function buildLegacyTaskPrefixCandidates(projectName: string, projectId: string): string[] {
  const initialCandidate = buildPrefixSeed(projectName);
  const collisionBase = initialCandidate.slice(0, MIN_PREFIX_LENGTH);
  const collisionOffset = calculateStableHash(projectId) % COLLISION_CANDIDATE_COUNT;
  const candidates = initialCandidate === RESERVED_PREFIX ? [] : [initialCandidate];

  for (let index = 0; index < COLLISION_CANDIDATE_COUNT; index += 1) {
    const candidate = `${collisionBase}${buildCollisionSuffix(collisionOffset + index)}`;
    if (candidate !== RESERVED_PREFIX && candidate !== initialCandidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}
