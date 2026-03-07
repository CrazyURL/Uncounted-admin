export type AudioMetrics = {
  sampleRate: number      // Hz
  channels: number        // 1=mono, 2=stereo
  bitrate: number         // kbps (estimated from fileSize/duration)
  rms: number             // 0-1, average loudness
  silenceRatio: number    // 0-1, fraction of silent frames
  snrDb: number           // dB, estimated SNR
  clippingRatio: number   // 0-1, fraction of clipped samples
  effectiveMinutes: number // E_i: speech-only duration in minutes
  qualityFactor: number   // Q_i: normalized 0-1
  rarityFactor: number    // D_i: domain rarity 0-1
  aiScore: number         // P_i = E_i × Q_i × D_i, normalized 0-100
}

/**
 * Real-time audio analysis via Web Audio API.
 * Call with an ArrayBuffer of the audio file content.
 */
export async function analyzeAudioBuffer(
  arrayBuffer: ArrayBuffer,
  fileSizeBytes: number,
  rarityFactor: number,
): Promise<AudioMetrics> {
  const ctx = new AudioContext()
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer)
    const sampleRate = buffer.sampleRate
    const channels = buffer.numberOfChannels
    const duration = buffer.duration
    const bitrate = Math.round((fileSizeBytes * 8) / duration / 1000)

    const channelData = buffer.getChannelData(0)
    const frameCount = channelData.length
    let sumSquares = 0
    let silentFrames = 0
    let clippedFrames = 0

    for (let i = 0; i < frameCount; i++) {
      const s = channelData[i]
      sumSquares += s * s
      if (Math.abs(s) < 0.01) silentFrames++
      if (Math.abs(s) > 0.99) clippedFrames++
    }

    const rms = Math.sqrt(sumSquares / frameCount)
    const silenceRatio = silentFrames / frameCount
    const clippingRatio = clippedFrames / frameCount
    const snrDb = Math.min(42, Math.max(0, 20 * Math.log10((rms + 1e-10) / 0.001)))

    const effectiveMinutes = (duration * (1 - silenceRatio)) / 60
    const bitrateScore = Math.min(1, bitrate / 192)
    const snrScore = Math.min(1, snrDb / 42)
    const srScore = sampleRate >= 44100 ? 1.0 : sampleRate >= 16000 ? 0.8 : 0.5
    const qualityFactor = bitrateScore * 0.3 + snrScore * 0.5 + srScore * 0.2
    const aiScore = Math.min(100, Math.round(effectiveMinutes * qualityFactor * rarityFactor * 2))

    return {
      sampleRate,
      channels,
      bitrate: Math.round(bitrate),
      rms: Math.round(rms * 1000) / 1000,
      silenceRatio: Math.round(silenceRatio * 1000) / 1000,
      snrDb: Math.round(snrDb * 10) / 10,
      clippingRatio: Math.round(clippingRatio * 10000) / 10000,
      effectiveMinutes: Math.round(effectiveMinutes * 10) / 10,
      qualityFactor: Math.round(qualityFactor * 100) / 100,
      rarityFactor,
      aiScore,
    }
  } finally {
    await ctx.close()
  }
}
