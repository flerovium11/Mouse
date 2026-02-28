import { pipeline, env } from '@huggingface/transformers';
//env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('/');

const data = [
"A security update has revoked classic tokens, limited granular tokens to 90 days, and requires 2FA by default. Users should update CI/CD workflows to avoid disruption.",
  "Ruvector is a fast vector database for Node.js, built in Rust, offering enterprise-grade semantic search for JavaScript/TypeScript developers.",
  "It boasts sub-millisecond queries, over 52,000 inserts/sec, and a memory footprint of ~50 bytes per vector, running universally.",
  "Developed by rUv, Ruvector uses production-grade Rust performance with intelligent platform detection, utilizing native bindings or WebAssembly as needed.",
  "Additional resources include ruv.io, its GitHub repository, and comprehensive documentation.",
  "Claude Code Intelligence v2.0 provides self-learning capabilities for Claude Code, featuring optimized hooks with ONNX embeddings, AST analysis, and coverage-aware routing.",
  "Users can set up Ruvector hooks with a single command to pretrain and generate agents for quality.",
  "Core features include Smart Agent Routing with Q-learning, a 9-Phase Pretrain using various analyses, an Agent Builder, Co-edit Patterns from git history, and HNSW-indexed Vector Memory.",
  "New in v2.0 are ONNX WASM Embeddings for local execution, AST Analysis for code structure, Diff Embeddings for semantic change classification, Coverage Routing, Graph Algorithms, Security Scanning, and RAG Context.",
  "Performance benchmarks show significant speedups: HNSW search is 8,800x faster than ONNX inference, and memory cache is 40,000x faster.",
  "Ruvector integrates an MCP server for Claude Code, offering over 30 tools, which can be added with a simple `claude mcp add ruvector` command.",
  "Available MCP tools cover agent routing, AST analysis, diff classification, coverage-aware routing, graph analysis, security scanning, RAG context, and neural capabilities.",
  "Existing vector databases often present trade-offs like high costs and vendor lock-in for cloud services, poor Node.js support for Python-first solutions, or complex infrastructure for self-hosted options.",
  "Ruvector eliminates these issues by offering native Node.js integration as a drop-in npm package with full TypeScript support and automatic platform detection.",
  "It delivers production-grade performance with over 52,000 inserts/second and sub-0.5ms query latency, using only ~50 bytes per vector.",
  "Ruvector is built for AI applications, optimized for LLM embeddings, RAG systems, agent memory, semantic caching, and real-time recommendation engines.",
  "It supports universal deployment across Linux, macOS, Windows, browsers (via WebAssembly), edge computing, serverless environments, and Alpine Linux.",
  "The solution offers zero operational costs, eliminating cloud API fees, infrastructure management, and separate database servers, under an MIT license.",
  "Key advantages include blazing-fast performance, automatic platform detection, AI-native design, included CLI tools, universal deployment, memory efficiency, production readiness, and open-source licensing.",
  "Installation is a single `npm install ruvector` command, which automatically detects the platform and downloads the correct native binary or falls back to WebAssembly.",
  "For Windows without build tools, `npm install ruvector --ignore-scripts` uses the ONNX WASM runtime, leveraging memory cache for speed.",
  "Users can verify installation with `npx ruvector info` to check the platform and implementation type (native Rust or WASM fallback).",
  "The tutorial demonstrates creating a `VectorDb` instance, specifying dimensions, max elements, and an optional storage path for persistence.",
  "Vectors are inserted with unique IDs, Float32Array embeddings, and optional metadata, simulating real-world embedding generation.",
  "Searching involves providing a query vector, `k` for the number of results, and an optional `threshold` for similarity.",
  "Specific vectors can be retrieved by their ID using the `db.get('doc1')` method.",
  "Database statistics, such as the total number of vectors, can be obtained using `db.len()`.",
  "Vectors can be removed from the database using the `db.delete('doc1')` method.",
  "Ruvector provides full TypeScript support, enabling type safety for all methods and properties.",
  "Users can define custom metadata types, ensuring compile-time type checking and improved developer experience.",
  "This allows for type-safe database creation, vector entry, search queries, and result retrieval, with full IntelliSense support.",
  "TypeScript benefits include full autocomplete, compile-time error prevention, IDE IntelliSense, custom metadata types, and complete type safety.",
  "Ruvector automatically detects the optimal implementation ('native' Rust for <0.5ms latency or 'wasm' for 10-50ms latency) for the platform.",
  "A comprehensive CLI is included for database management, accessible via `npx ruvector`.",
  "The `npx ruvector create` command allows creating a new vector database with specified dimensions, distance metric, and max elements.",
  "Vectors can be inserted from a JSON file using `npx ruvector insert`, following a specific JSON format for entries.",
  "The `npx ruvector search` command performs similarity searches with options for query vector, top-k results, and similarity threshold.",
  "Database statistics like total vectors, dimensions, metric, memory usage, and index type are displayed using `npx ruvector stats`.",
  "Performance benchmarks can be run with `npx ruvector benchmark`, configuring the number of vectors and queries.",
  "System information, including platform, implementation type, GNN module availability, Node.js version, and performance, is shown by `npx ruvector info`.",
  "Optional packages, such as GNN for Graph Neural Networks, can be listed and installed using `npx ruvector install`.",
  "Ruvector includes Graph Neural Network (GNN) capabilities for advanced tensor compression and differentiable search.",
  "The `npx ruvector gnn info` command displays GNN module information, including status, platform, architecture, and available features like RuvectorLayer and TensorCompress.",
  "Users can create and test GNN layers with `npx ruvector gnn layer`, specifying input/hidden dimensions and attention heads.",
  "Embeddings can be compressed using adaptive tensor compression levels (none, half, pq8, pq4, binary) via `npx ruvector gnn compress`.",
  "Differentiable search with soft attention is available through `npx ruvector gnn search`, allowing queries against candidate vectors.",
  "Ruvector also features high-performance attention mechanisms for transformer-based operations, hyperbolic embeddings, and graph attention.",
  "Various attention mechanisms are available, including DotProductAttention, MultiHeadAttention, FlashAttention, HyperbolicAttention, LinearAttention, MoEAttention, GraphRoPeAttention, EdgeFeaturedAttention, DualSpaceAttention, and LocalGlobalAttention.",
  "The `npx ruvector attention info` command provides details on the attention module, including status, version, platform, and core mechanisms.",
  "Users can list all available attention mechanisms with `npx ruvector attention list`, with a verbose option for more details.",
  "Attention mechanisms can be benchmarked using `npx ruvector attention benchmark`, specifying vector dimension, number of vectors, iterations, and types.",
  "Hyperbolic operations like calculating Poincaré distance, projecting vectors to the Poincaré ball, Möbius addition, and exponential/log maps are available via `npx ruvector attention hyperbolic`.",
  "Guidance is provided on selecting the appropriate attention type for use cases like standard NLP, long documents, hierarchical classification, knowledge graphs, and model routing.",
  "RuVector v2.0 includes ONNX WASM Embeddings, providing a pure JavaScript ONNX runtime for local embeddings without external APIs or build tools.",
  "It uses the all-MiniLM-L6-v2 model (384 dimensions, 23MB), which downloads automatically and is SIMD-accelerated, offering fast embedding (~50ms) and HNSW search (0.045ms).",
  "Ruvector v2.0 features self-learning intelligence hooks for Claude Code, integrating ONNX embeddings, AST analysis, and coverage-aware routing.",
  "Hooks can be initialized with `npx ruvector hooks init`, with options for force overwrite, minimal config, pretraining, and agent generation.",
  "Session management commands (`session-start`, `session-end`) load and save intelligence data for learned patterns.",
  "Pre/Post Edit hooks provide agent recommendations before editing and record success/failure for learning after edits.",
  "Pre/Post Command hooks offer risk analysis before commands and record outcomes for learning after execution.",
  "Agent Routing suggests optimal agents for tasks based on confidence, like 'security-specialist' for bug fixes or 'tester' for unit tests.",
  "Memory operations allow storing context in vector memory (`remember`) and semantically searching it (`recall`).",
  "Context suggestions provide relevant information based on recent files for the current task.",
  "Intelligence statistics (`npx ruvector hooks stats`) display learned patterns, success rates, top agents, and memory entries.",
  "Swarm recommendations suggest agents for specific task types, such as 'code-review'.",
  "AST Analysis (v2.0) enables analyzing file structure, symbols, imports, and complexity, with options to flag files exceeding complexity thresholds.",
  "Diff & Risk Analysis (v2.0) analyzes commits using semantic embeddings for risk scoring, classifies change types, finds similar past commits, and performs Git churn analysis.",
  "Coverage-Aware Routing (v2.0) provides agent weights based on test coverage and suggests tests for files with coverage gaps.",
  "Graph Analysis (v2.0) includes MinCut for optimal code boundaries and Louvain/Spectral clustering for detecting code communities.",
  "Security & RAG (v2.0) offers parallel vulnerability pattern detection and RAG-enhanced context retrieval, alongside enhanced routing with all signals.",
  "Hooks integrate with Claude Code via `.claude/settings.json`, configuring environment variables and defining `PreToolUse`, `PostToolUse`, `SessionStart`, and `Stop` hooks.",
  "Self-learning works by recording edits/commands, using Q-learning to update agent routing, AST analysis for agent selection, diff embeddings for risk assessment, coverage routing for testing priorities, and HNSW-indexed vector memory for semantic recall.",
  "Native Rust performance benchmarks show high throughput: 52,341 inserts/sec, 11,234 searches/sec (k=10), and 45,678 deletes/sec, all with sub-millisecond latencies.",
  "Memory usage is highly efficient, at approximately 50 bytes per 128-dimensional vector, including the index.",
  "Compared to alternatives, Ruvector (Native) offers superior insert and search throughput with lower memory per vector than Faiss, Hnswlib, and ChromaDB.",
  "A detailed comparison table highlights Ruvector's advantages in Node.js native support, setup time, infrastructure, query latency, insert throughput, memory efficiency, and browser/WASM support over Pinecone, Qdrant, Weaviate, Milvus, ChromaDB, and Faiss.",
  "Ruvector is ideal for Node.js/TypeScript apps, serverless/edge computing, rapid prototyping, RAG systems, cost-sensitive projects, offline-first apps, browser AI, and small to medium scale (up to 10M vectors).",
  "Alternatives should be considered for massive scale (100M+ vectors), multi-tenancy, distributed systems, or zero-ops cloud solutions.",
  "Ruvector offers significant advantages over Pinecone (no API costs, lower latency, no vendor lock-in), ChromaDB (50x faster, true Node.js support, better TypeScript), Qdrant (zero infrastructure, embedded, serverless-friendly), and Faiss (full Node.js support, easier API, built-in persistence).",
  "Tutorial 1 demonstrates building a RAG system with OpenAI, indexing documents, retrieving context, and generating answers using Ruvector.",
  "The RAG implementation involves initializing OpenAI and Ruvector, indexing documents by generating embeddings, retrieving context for queries, and generating LLM answers with the retrieved context.",
  "Production tips for RAG include using batch embedding, implementing caching, adding error handling, monitoring token usage, and regularly updating the knowledge base.",
  "Tutorial 2 guides users through building a semantic search engine that understands meaning, running completely locally without API keys.",
  "The semantic search implementation involves initializing an embedding model (Xenova/all-MiniLM-L6-v2), generating embeddings, indexing documents, and performing semantic searches with optional category filtering.",
  "Key features of the semantic search engine include local operation, semantic understanding, category filtering, 'find similar' functionality, and fast query latency (~10ms).",
  "Tutorial 3 illustrates implementing an AI agent memory system that stores past experiences and learned knowledge.",
  "The agent memory system uses separate `VectorDb` instances for episodic and semantic memory, allowing agents to store experiences, learn knowledge, recall similar experiences, query knowledge, and reflect on their learning.",
  "Use cases for the AI agent memory system include reinforcement learning agents, chatbot conversation history, game AI, personal assistant memory, and robotic navigation systems.",
  "The `VectorDb` constructor requires `dimensions` and accepts optional `maxElements`, `storagePath`, HNSW parameters (`ef_construction`, `m`), and `distanceMetric`.",
  "The `insert(entry: VectorEntry)` method adds a vector with an ID, Float32Array, and optional metadata to the database.",
  "The `search(query: SearchQuery)` method finds similar vectors based on a query vector, returning `k` results above a `threshold`.",
  "The `get(id: string)` method retrieves a specific `VectorEntry` by its ID, or `null` if not found.",
  "The `delete(id: string)` method removes a vector from the database, returning a boolean indicating success.",
  "The `len()` method asynchronously returns the total number of vectors currently stored in the database.",
  "Advanced HNSW parameters like `ef_construction` (100-400) and `m` (8-64) can be configured for recall vs. indexing speed and memory trade-offs.",
  "Ruvector supports 'cosine' (default), 'euclidean' (L2), and 'dot' product distance metrics, chosen based on vector normalization and data type.",
  "Persistence is configured via `storagePath` for auto-saving to disk, or omitted for faster, in-memory-only operation.",
  "Native Rust implementation offers best performance (<0.5ms latency, 50K+ ops/sec) on Linux x64/ARM64, macOS x64/ARM64, and Windows x64.",
  "A WebAssembly (WASM) fallback provides universal compatibility (10-50ms latency, ~1K ops/sec) for platforms without native modules, browsers, and non-glibc systems like Alpine Linux.",
  "To build from source, users need Rust 1.77+, Node.js 18+, and Cargo, then clone the repository and run build commands for the native module and wrapper package.",
  "The Ruvector ecosystem includes `ruvector-core` (native bindings), `ruvector-wasm` (WebAssembly), `ruvector-cli` (CLI tools), and RVF-related packages.",
  "Platform-specific packages like `ruvector-core-linux-x64-gnu` are automatically installed based on the detected environment.",
  "Ruvector integrates with RVF (RuVector Format), a universal binary substrate for storing vectors, models, graphs, and compute kernels in a single `.rvf` file.",
  "The RVF backend can be enabled by installing `@ruvector/rvf` and setting `RUVECTOR_BACKEND=rvf` or allowing automatic detection.",
  "RVF CLI commands include `create`, `ingest`, `query`, `status`, `segments`, `derive` (for COW branching), `compact`, and `export`.",
  "RVF supports Node.js (Native N-API) on Linux, macOS, Windows, and WASM (`@ruvector/rvf-wasm`) for Deno, browsers, and Cloudflare Workers.",
  "Example `.rvf` files, such as `basic_store.rvf` and `rag_pipeline.rvf`, are available for download to demonstrate various use cases.",
  "Working examples of RVF cognitive containers include a self-booting microservice with vectors and a Linux kernel, a 20-package Linux microkernel distribution, and a Claude Code AI appliance.",
  "The RVF CLI supports a full lifecycle: create, ingest, query, derive, inspect, embed kernel, launch as microVM, and verify witness/attestation.",
  "RVF integration tests cover attestation, crypto, computational containers, COW branching, cross-platform, lineage, and smoke tests, with 46 passing.",
  "Troubleshooting for 'Cannot find module 'ruvector-core-*'' involves reinstalling with optional dependencies, verifying the platform, and checking for Node.js 18+.",
  "To improve WASM fallback performance, users should install the native toolchain, rebuild the native module, and verify native implementation.",
  "Platform compatibility notes indicate WASM fallback for Alpine Linux and Windows ARM, and Node.js 18+ as a general requirement.",
  "Comprehensive documentation is available via the homepage, GitHub repository, API reference, getting started guide, performance tuning, issue tracker, and discussions.",
  "Contributions are welcomed, with guidelines provided in `CONTRIBUTING.md` for forking, branching, committing, pushing, and opening pull requests.",
  "Community support is available on GitHub (star and follow), Discord, and Twitter (@ruvnet), with an issue tracker for bugs.",
  "Enterprise support for custom development or consulting can be reached at enterprise@ruv.io.",
  "Ruvector is released under the MIT License, allowing free commercial and personal use.",
  "The project acknowledges battle-tested technologies like HNSW, SIMD, Rust, NAPI-RS, and WebAssembly.",
  "Keywords associated with Ruvector include vector, database, search, embeddings, HNSW, AI, RAG, Rust, WASM, native, attention, transformer, ONNX, and edge-computing.",
  "The package sidebar shows `npm i ruvector` for installation, links to its GitHub and homepage, reports 15,276 weekly downloads, version 0.2.2, MIT license, 8.72 MB unpacked size, 123 total files, and was last published 5 hours ago."
];

const target = 'javascript is an amazing languages';

(async () => {
  console.log("Mouse extension loaded");

  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { 
    device: 'auto',
  dtype:'fp32' });

  console.log('Settings:', env.backends.onnx.wasm);

  console.log(`Extracting ${data.length} vectors...`);
  console.time('Extraction time');
  const out = await extractor(data, { pooling: 'mean', normalize: true });
  console.timeEnd('Extraction time');
  console.log('Extraction complete. Output shape:', out.dims);
  const targetVec = await extractor(target, { pooling: 'mean', normalize: true });

  const targetNorm = Math.sqrt(targetVec.data.reduce((sum: number, val: number) => sum + val * val, 0));
  const vec_length = out.dims[1];
  const results: { index: number; similarity: number }[] = [];

  for (let dim = 0; dim < out.dims[0]; dim++) {
    const vec = out.data.slice(dim * vec_length, (dim + 1) * vec_length);
    let dotProduct = 0, vecNorm = 0;
    for (let i = 0; i < vec.length; i++) {
      dotProduct += vec[i] * targetVec.data[i];
      vecNorm += vec[i] * vec[i];
    }
    results.push({ index: dim, similarity: dotProduct / (Math.sqrt(vecNorm) * targetNorm) });
  }

  results.sort((a, b) => b.similarity - a.similarity);

  console.log('Top 5 similar texts:');
  for (let i = 0; i < 5; i++) {
    console.log(`[${results[i].similarity.toFixed(4)}] ${data[results[i].index]}`);
  }
})();
