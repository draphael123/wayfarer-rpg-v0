export interface RecoveryIncident {
  id: string;
  inBattle: boolean;
}

export interface RecoveryCallbacks {
  retry(): void;
  leave(): void;
  export(): string;
}

/** DOM-only safety screen; it keeps working even when the canvas loop is stopped. */
export class RecoveryPanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly copy: HTMLElement;
  private readonly report: HTMLElement;
  private readonly status: HTMLElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly leaveButton: HTMLButtonElement;
  private incident: RecoveryIncident | null = null;

  constructor(private readonly callbacks: RecoveryCallbacks) {
    this.root = document.createElement("div");
    this.root.id = "recovery-overlay";
    this.root.hidden = true;
    this.root.innerHTML = `
      <section class="recovery-card" role="alertdialog" aria-modal="true" aria-labelledby="recovery-title" aria-describedby="recovery-copy">
        <div class="recovery-kicker">The road can wait</div>
        <h2 id="recovery-title"></h2>
        <p id="recovery-copy"></p>
        <p class="recovery-report"></p>
        <div class="recovery-actions">
          <button type="button" class="recovery-btn primary" data-recovery="retry"></button>
          <button type="button" class="recovery-btn" data-recovery="leave"></button>
          <button type="button" class="recovery-btn quiet" data-recovery="export">Download report</button>
        </div>
        <p class="recovery-status" aria-live="polite"></p>
      </section>`;
    document.body.appendChild(this.root);
    this.title = this.root.querySelector("#recovery-title")!;
    this.copy = this.root.querySelector("#recovery-copy")!;
    this.report = this.root.querySelector(".recovery-report")!;
    this.status = this.root.querySelector(".recovery-status")!;
    this.retryButton = this.root.querySelector('[data-recovery="retry"]')!;
    this.leaveButton = this.root.querySelector('[data-recovery="leave"]')!;
    this.root.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-recovery]");
      if (!button || !this.incident) return;
      const action = button.dataset.recovery;
      if (action === "retry") this.callbacks.retry();
      else if (action === "leave") this.callbacks.leave();
      else if (action === "export") this.downloadReport();
    });
  }

  show(incident: RecoveryIncident): void {
    this.incident = incident;
    this.title.textContent = incident.inBattle ? "The battle hit an unexpected snag" : "Wayband hit an unexpected snag";
    this.copy.textContent = incident.inBattle
      ? "The fight has been paused before anything else could go wrong. Your saved progress is safe."
      : "The game has paused safely. You can try again or reload Wayband.";
    this.report.textContent = `Report ${incident.id}`;
    this.retryButton.textContent = incident.inBattle ? "Restart battle" : "Try again";
    this.leaveButton.textContent = incident.inBattle ? "Return to map" : "Reload game";
    this.status.textContent = "";
    this.root.hidden = false;
    this.retryButton.focus();
  }

  hide(): void {
    this.root.hidden = true;
    this.incident = null;
    this.status.textContent = "";
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  private downloadReport(): void {
    if (!this.incident) return;
    try {
      const blob = new Blob([this.callbacks.export()], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `wayband-diagnostics-${this.incident.id}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
      this.setStatus("Report downloaded. Attach it when describing what happened.");
    } catch {
      this.setStatus("The report could not be downloaded. Try returning to the map, then export playtest data from Settings.");
    }
  }
}
