// @ts-nocheck
const { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { basename, join } = require("node:path");

// replaced by somthing to read in  json 
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
            "command": "python main.py",
            "codes": {
                "0": 5,
                "1": 0,
            }
        }
    ],
    // Overlay URLs may be normal Git URLs or GitHub paths ending in /<overlay>@<branch>.
    "overlays": [
        "https://github.com/WeicJa210116/ForgejoTestActions/overlays/testOverlay@overlays",
        //"https://athene-forgejo.gametec-live.com/litec-grading/overlay2.git"
    ]
};

const overlayRoot = join(process.cwd(), "overlays");
mkdirSync(overlayRoot, { recursive: true });

// Convert an overlay URL into its Git URL, branch, and optional subdirectory.
function parseOverlayUrl(overlayUrl) {
    const url = new URL(overlayUrl);
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const lastSegment = pathSegments.at(-1) ?? "";

    // Leave non-GitHub URLs and GitHub URLs without the /<name>@<branch> suffix unchanged.
    if (url.hostname.toLowerCase() !== "github.com" || !lastSegment.includes("@")) {
        return {
            repoName: basename(url.pathname).replace(/\.git$/, ""),
            gitUrl: overlayUrl,
            branch: undefined,
            subdirectory: undefined,
        };
    }

    const branchSeparator = lastSegment.lastIndexOf("@");
    const branch = decodeURIComponent(lastSegment.slice(branchSeparator + 1));
    const overlayName = decodeURIComponent(lastSegment.slice(0, branchSeparator));
    const subdirectorySegments = pathSegments.slice(2, -1).concat(overlayName);

    if (pathSegments.length < 3 || !branch || !overlayName) {
        throw new Error(`Invalid GitHub overlay URL: ${overlayUrl}`);
    }

    const decodedSubdirectorySegments = subdirectorySegments.map(decodeURIComponent);
    if (decodedSubdirectorySegments.some(segment => segment === "." || segment === ".." || segment.includes("/"))) {
        throw new Error(`Invalid overlay subdirectory in URL: ${overlayUrl}`);
    }

    // Rewrite the URL path to the actual GitHub repository's clone URL.
    url.pathname = `/${pathSegments.slice(0, 2).join("/")}.git`;
    url.search = "";
    url.hash = "";

    return {
        repoName: overlayName,
        gitUrl: url.toString(),
        branch,
        subdirectory: decodedSubdirectorySegments.join("/"),
    };
}

// Run a Git command, forward its output, and stop if Git reports a failure.
function runGit(args, overlayName) {
    const result = spawnSync("git", args, { encoding: "utf8" });
    // Print Git's standard output when it produced any.
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    // Report spawn errors or non-zero Git exit codes and fail the action.
    if (result.error || result.status !== 0) {
        console.error(`Failed to prepare overlay ${overlayName}: ${result.error?.message ?? `git exited with status ${result.status}`}`);
        process.exit(result.status ?? 1);
    }
}

for (const overlayUrl of testJson.overlays) {
    const { repoName, gitUrl, branch, subdirectory } = parseOverlayUrl(overlayUrl);
    const overlayPath = join(overlayRoot, repoName);

    // Refuse to use an existing destination unless it is already a Git repository.
    if (existsSync(overlayPath) && !existsSync(join(overlayPath, ".git"))) {
        console.error(`Overlay destination exists but is not a Git repository: ${overlayPath}`);
        process.exit(1);
    }

    if (existsSync(overlayPath)) {
        runGit(["-C", overlayPath, "pull", "--ff-only"], repoName);
    } else {
        const cloneArgs = ["clone", "--depth", "1"];
        if (branch) cloneArgs.push("--branch", branch, "--sparse");
        cloneArgs.push("--", gitUrl, overlayPath);
        runGit(cloneArgs, repoName);
    }

    if (subdirectory) {
        runGit(["-C", overlayPath, "sparse-checkout", "set", "--cone", subdirectory], repoName);
    }

    const overlayContentsPath = subdirectory ? join(overlayPath, subdirectory) : overlayPath;
    if (!existsSync(overlayContentsPath)) {
        console.error(`Overlay contents not found: ${overlayContentsPath}`);
        process.exit(1);
    }

    for (const entry of readdirSync(overlayContentsPath)) {
        if (entry === ".git") continue;
        cpSync(join(overlayContentsPath, entry), join(process.cwd(), entry), {
            recursive: true,
            force: true,
        });
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

// print final score
console.log(`points=${totalPoints}`);
if (process.env.FORGEJO_OUTPUT) {
    appendFileSync(process.env.FORGEJO_OUTPUT, `points=${totalPoints}\n`);
}
