export namespace SimTools {
  function cosineSimilarity(a: number[], b: number[]) {
    if (a.length !== b.length) {
      throw new Error("Vectors must have same length");
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  export interface DatasetItem {
    id: string
    vector: number[]
  }

  export interface TopKOutput {
    id: string
    score: number
  }

  export function topKSimilar(x: number[], zList: DatasetItem[], k: number = 5): TopKOutput[] {
    const scored = zList.map(item => ({
      id: item.id,
      score: cosineSimilarity(x, item.vector)
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, k);
  }
}
