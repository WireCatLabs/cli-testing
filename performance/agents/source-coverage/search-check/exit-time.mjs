// Prints the time of exit on stderr, so prof.sh sees how long the process lived after its last stage
process.on("exit", () => process.stderr.write(`T exit ${performance.now().toFixed(0)}\n`))
