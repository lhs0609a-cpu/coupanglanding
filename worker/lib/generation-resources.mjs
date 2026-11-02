// One resource policy shared by the desktop launcher and batch scheduler.
// Unknown measurements use the conservative CPU profile.
export function generationResources({ gpu = {}, ram = {}, cores = 1 } = {}) {
  const free = Math.max(0, Number(gpu.vramFreeMb) || 0);
  const available = ram.reliable ? Math.max(0, Number(ram.freeMb) || 0) : 0;
  const gpuReady = !!gpu.ok && free >= 3500;
  const large = gpuReady && free >= 8000 && available >= 5000;
  const concurrency = large && available >= 8000 && cores >= 4
    ? (free >= 16000 ? 3 : free >= 12000 ? 2 : 1) : 1;
  return {
    strong: large,
    concurrency,
    recogConcurrency: 1,
    visionOverlap: large && free >= 16000 && available >= 10000,
    requestTimeoutMs: gpuReady ? 600000 : 1200000,
    engineWaitMs: gpuReady ? 300000 : 600000,
    // CPU offload needs both model weights and working buffers in system RAM.
    memoryBlocked: !gpuReady && ram.reliable && available < 3000,
    measurements: { gpu: gpu.name || null, vramFreeMb: free, ramFreeMb: available, cores },
  };
}

export function isRecoverableGenerationError(error) {
  return /fetch failed|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|terminated|out of memory|CPU_REPACK|alloc_tensor|cpu_buffer|TimeoutError|timed? ?out|timeout|엔진|메모리|연결/i.test(String(error?.message || error));
}
