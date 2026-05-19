<?php
/**
 * Export all levels from MySQL, run the C batch solver (solve_db),
 * and write one .txt solution per level under output/solutions/.
 *
 * Usage (from project root, with MAMP MySQL running):
 *   php solveurCrenvoyanttxt/cli/solve_from_db.php
 *   php solveurCrenvoyanttxt/cli/solve_from_db.php --gems-only
 *   php solveurCrenvoyanttxt/cli/solve_from_db.php --no-fallback
 *
 * Prerequisites:
 *   cd solveurCrenvoyanttxt && make
 */

declare(strict_types=1);

$moduleRoot  = dirname(__DIR__);
$projectRoot = dirname($moduleRoot);
$config      = require $projectRoot . '/web/includes/config.php';

$levelsDir     = $moduleRoot . '/output/levels';
$solutionsDir  = $moduleRoot . '/output/solutions';
$manifestPath  = $moduleRoot . '/output/levels_manifest.txt';

$useSafePath   = true;
$allowFallback = true;

foreach (array_slice($argv, 1) as $arg) {
    if ($arg === '--gems-only') {
        $useSafePath = false;
        $allowFallback = false;
    } elseif ($arg === '--no-fallback') {
        $allowFallback = false;
    } elseif ($arg === '--help' || $arg === '-h') {
        echo "Usage: php solveurCrenvoyanttxt/cli/solve_from_db.php [--gems-only] [--no-fallback]\n";
        exit(0);
    } else {
        fwrite(STDERR, "Unknown option: {$arg}\n");
        exit(2);
    }
}

foreach ([$levelsDir, $solutionsDir, dirname($manifestPath)] as $dir) {
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        fwrite(STDERR, "Cannot create directory: {$dir}\n");
        exit(1);
    }
}

$dsn = sprintf(
    'mysql:host=%s;dbname=%s;charset=%s',
    $config['host'],
    $config['dbname'],
    $config['charset']
);

try {
    $pdo = new PDO($dsn, $config['user'], $config['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    fwrite(STDERR, "Database connection failed: " . $e->getMessage() . "\n");
    fwrite(STDERR, "Check web/includes/config.php (host, user, password, dbname).\n");
    exit(1);
}

$stmt = $pdo->query('SELECT id, map FROM niveau ORDER BY id ASC');
$rows = $stmt->fetchAll();

if (count($rows) === 0) {
    fwrite(STDERR, "No levels found in table niveau.\n");
    exit(1);
}

$manifestLines = [];
foreach ($rows as $row) {
    $id   = (int)$row['id'];
    $map  = (string)$row['map'];
    $path = $levelsDir . '/level_' . $id . '.txt';

    if (file_put_contents($path, $map) === false) {
        fwrite(STDERR, "Cannot write level file: {$path}\n");
        exit(1);
    }

    $manifestLines[] = $id . '|' . $path;
    echo "Exported level {$id} -> {$path}\n";
}

if (file_put_contents($manifestPath, implode("\n", $manifestLines) . "\n") === false) {
    fwrite(STDERR, "Cannot write manifest: {$manifestPath}\n");
    exit(1);
}
echo "Manifest: {$manifestPath}\n";

$candidates = [
    $moduleRoot . '/solve_db.exe',
    $moduleRoot . '/solve_db',
];

$solveDb = null;
foreach ($candidates as $c) {
    if (is_file($c)) {
        $solveDb = realpath($c);
        break;
    }
}

if ($solveDb === null) {
    fwrite(STDERR, "\nBinary solve_db not found. Build it first:\n");
    fwrite(STDERR, "  cd solveurCrenvoyanttxt\n");
    fwrite(STDERR, "  make\n\n");
    exit(1);
}

$cmd = escapeshellarg($solveDb)
    . ' --manifest ' . escapeshellarg($manifestPath)
    . ' --output-dir ' . escapeshellarg($solutionsDir);

if ($useSafePath) {
    $cmd .= ' --safe-path';
}
if ($allowFallback) {
    $cmd .= ' --fallback';
} elseif (!$useSafePath) {
    $cmd .= ' --gems-only';
}

echo "\nRunning: {$cmd}\n\n";

$output = [];
$exitCode = 0;
exec($cmd . ' 2>&1', $output, $exitCode);
echo implode("\n", $output) . "\n";

echo "\nSolutions directory: {$solutionsDir}\n";
exit($exitCode);
