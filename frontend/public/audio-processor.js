/**
 * AudioWorkletProcessor: 48kHz Float32 -> 16kHz Int16 PCM 変換
 *
 * ブラウザの AudioContext (48kHz) から Deepgram が期待する
 * 16kHz 16-bit signed PCM モノラルに変換する。
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(0);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // モノラル (チャネル0)

    // 既存バッファに追加
    const newBuffer = new Float32Array(this._buffer.length + channelData.length);
    newBuffer.set(this._buffer);
    newBuffer.set(channelData, this._buffer.length);
    this._buffer = newBuffer;

    // 480サンプル (10ms @ 48kHz) 溜まったら変換
    while (this._buffer.length >= 480) {
      const chunk = this._buffer.slice(0, 480);
      this._buffer = this._buffer.slice(480);

      // 3:1 ダウンサンプル: 480 samples @ 48kHz -> 160 samples @ 16kHz
      const downsampled = new Int16Array(160);
      for (let i = 0; i < 160; i++) {
        const sample = chunk[i * 3];
        // Float32 [-1.0, 1.0] -> Int16 [-32768, 32767]
        downsampled[i] = Math.max(
          -32768,
          Math.min(32767, Math.round(sample * 32767))
        );
      }

      this.port.postMessage(downsampled.buffer, [downsampled.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
