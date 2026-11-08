/**
 * Cosine Similarity Utilities for Incident Embeddings
 * Provides pure mathematical vector operations and candidate ranking.
 * Encapsulated in a single module so brute-force search can be easily swapped
 * for MongoDB Atlas Vector Search ($vectorSearch) in the future.
 */

export interface VectorCandidate<T = unknown> {
  id: string;
  vector: number[];
  metadata?: T;
}

export interface SimilarityResult<T = unknown> {
  id: string;
  similarity: number;
  metadata?: T;
}

/**
 * Computes cosine similarity between two numeric vectors.
 * Returns a score between -1.0 and 1.0 (or 0 for zero/mismatched vectors).
 */
export function cosineSimilarity(
  vecA: number[] | null | undefined,
  vecB: number[] | null | undefined
): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) {
    return 0;
  }

  if (vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  const score = dotProduct / denominator;
  // Guard against floating point inaccuracies beyond [-1, 1]
  return Math.max(-1, Math.min(1, score));
}

/**
 * Normalizes a vector to unit length (L2 norm = 1.0).
 */
export function normalizeVector(vector: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }

  const norm = Math.sqrt(sumSq);
  if (norm === 0) {
    return new Array(vector.length).fill(0);
  }

  return vector.map((v) => v / norm);
}

/**
 * Search candidates by cosine similarity against target vector.
 * Filters by minThreshold, sorts descending, and returns top `limit` results.
 */
export function findTopSimilar<T = unknown>(
  targetVector: number[],
  candidates: VectorCandidate<T>[],
  options?: {
    limit?: number;
    minThreshold?: number;
  }
): SimilarityResult<T>[] {
  const limit = options?.limit ?? 3;
  const minThreshold = options?.minThreshold ?? 0.0;

  if (!targetVector || targetVector.length === 0 || !candidates || candidates.length === 0) {
    return [];
  }

  const scored: SimilarityResult<T>[] = [];

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(targetVector, candidate.vector);
    if (similarity >= minThreshold) {
      scored.push({
        id: candidate.id,
        similarity: Math.round(similarity * 10000) / 10000, // 4 decimal places
        metadata: candidate.metadata,
      });
    }
  }

  // Sort descending by similarity score
  scored.sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, limit);
}

