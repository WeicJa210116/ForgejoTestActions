// @ts-nocheck
const { appendFileSync, existsSync, mkdirSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { basename, join } = require("node:path");

const testJson = {
    "grading": [
        {
            "name": "test1",
            "command": "cat abc.txt",
            "codes": {
                "0": 5, // "exitCode":points
                "1": 0,
                "2": 2
            }
        },
        {
            "name": "test2",
            "command": "cat abc2.txt",
            "codes": {
                "0": 1,
                "1": 0
            }
        },
        {
            "name": "test3",
            "command": "cat abc3.txt",
            "codes": {
                "0": 4,
                "1": 2,
                "7": 3
            }
        },
        {
            "name": "test Python run",
            "command": "python ./main.py",
            "codes": {
                "TEst": 5,
                "": 2,
            }
        }
    ],
    "overlays": [
        "https://github.com/WeicJa210116/ForgejoTestActions/overlays/testOverlay@overlays",
        //"https://athene-forgejo.gametec-live.com/litec-grading/overlay2.git"
    ]
};


const overlayRoot = join(process.cwd(), "overlays");
mkdirSync(overlayRoot, { recursive: true });

for (const overlayUrl of testJson.overlays) {
    const repoName = basename(new URL(overlayUrl).pathname).replace(/\.git$/, "");
    const overlayPath = join(overlayRoot, repoName);
    const gitArgs = existsSync(overlayPath)
        ? ["-C", overlayPath, "pull", "--ff-only"]
        : ["clone", "--depth", "1", "--", overlayUrl, overlayPath];

    if (existsSync(overlayPath) && !existsSync(join(overlayPath, ".git"))) {
        console.error(`Overlay destination exists but is not a Git repository: ${overlayPath}`);
        process.exit(1);
    }

    const result = spawnSync("git", gitArgs, { encoding: "utf8" });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.error || result.status !== 0) {
        console.error(`Failed to prepare overlay ${repoName}: ${result.error?.message ?? `git exited with status ${result.status}`}`);
        process.exit(result.status ?? 1);
    }
}


let totalPoints = 0;

for (const test of testJson.grading) {
    const result = spawnSync(test.command, {
        encoding: "utf8",
        shell: true,
    });

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) console.error(`${test.name}: ${result.error.message}`);

    const exitCode = result.status;
    const points = test.codes[String(exitCode)] ?? 0; // Default to 0 if exit code is not found
    totalPoints += points;
    console.log(`${test.name}: exit code ${exitCode}, points ${points}`);
}

await

console.log(`points=${totalPoints}`);
if (process.env.FORGEJO_OUTPUT) {
    appendFileSync(process.env.FORGEJO_OUTPUT, `points=${totalPoints}\n`);
}
