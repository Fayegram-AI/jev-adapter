/** Generated and local data excluded from source and package contents. */
const LOCAL_DIRECTORIES = new Set([
    '.git', '.local', 'node_modules', 'dist', 'build', 'out', 'coverage',
    'release', 'scratch', 'tmp', 'temp', 'logs',
]);
const EVALUATION_DIRECTORIES = new Set([
    'benchmark', 'benchmarks', 'dataset', 'datasets', 'eval', 'evals',
    'evaluation', 'evaluations', 'experiment', 'experiments',
    'model-evals', 'model-evaluations', 'results',
]);

const GENERATED_DATA_FILE = /(?:^|\/)[^/]*(?:dataset|benchmark)[^/]*\.(?:mjs|mts|jsonl)$/i;

export function isLocalOnlyPath(name) {
    const path = name.replaceAll('\\', '/');
    const parts = path.split('/');
    return LOCAL_DIRECTORIES.has(parts[0]) ||
        parts.some(part => EVALUATION_DIRECTORIES.has(part)) ||
        GENERATED_DATA_FILE.test(path);
}
