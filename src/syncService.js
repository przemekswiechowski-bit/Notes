export class SyncService {
  constructor(onStatus = () => {}) {
    this.onStatus = onStatus;
    this.status = "local";
  }

  setStatus(status) {
    this.status = status;
    this.onStatus(status);
  }

  async schedule() {
    this.setStatus("local");
    return { status: this.status };
  }
}
