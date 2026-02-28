import { pipeline } from '@huggingface/transformers';

const data = [
  "The cat sat on the mat.",
  "A dog played in the park.",
  "Machine learning is transforming the world.",
  "The weather is sunny today.",
  "Neural networks can learn complex patterns.",
  "I love eating pizza on weekends.",
  "Deep learning models require large datasets.",
  "The sun sets in the west.",
  "Natural language processing is a subfield of AI.",
  "She went for a morning jog.",
];

const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

console.log(`Extracting ${data.length} vectors for dataset...`);
console.time('Extraction');
const out = await extractor(data, { pooling: 'mean', normalize: true });
console.timeEnd('Extraction');

var target = 'This is a test sentence to find similar sentences in the dataset.';

const targetVec = await extractor(target, { pooling: 'mean', normalize: true });
var targetNorm = Math.sqrt(targetVec.data.reduce((sum, val) => sum + val * val, 0));

var vec_length = out.dims[1];
var results = [];

for (let dim = 0; dim < out.dims[0]; dim++) {
  var vec = out.data.slice(dim * vec_length, (dim + 1) * vec_length);
  var dotProduct = 0;
  var vecNorm = 0;
  for (let i = 0; i < vec.length; i++) {
    dotProduct += vec[i] * targetVec.data[i];
    vecNorm += vec[i] * vec[i];
  }
  vecNorm = Math.sqrt(vecNorm);
  results.push({ index: dim, similarity: dotProduct / (vecNorm * targetNorm) });
}

results.sort((a, b) => b.similarity - a.similarity);

console.log('\nTop 5 similar texts:');
for (let i = 0; i < 5; i++) {
  console.log(`[${results[i].similarity.toFixed(4)}] ${data[results[i].index]}`);
}

console.log('\nLeast similar text:');
var least = results[results.length - 1];
console.log(`[${least.similarity.toFixed(4)}] ${data[least.index]}`);
