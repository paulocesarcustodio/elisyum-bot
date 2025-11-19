export const helpers = {
  findYtdlpBinary() {
    return "/tmp/yt-dlp"
  },
  async downloadYtDlp() {
    return "/tmp/yt-dlp"
  }
}

export class YtDlp {
  async getInfoAsync() {
    return { id: "stub", formats: [] }
  }

  async getFileAsync() {
    return { async arrayBuffer() { return new ArrayBuffer(0) } }
  }
}
