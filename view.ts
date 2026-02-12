import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type EchoWebSyncPlugin from "./main";
import type { TimeEntryResponse, Project, Todo, DailySummaryResponse } from "./types";
import { AudioRecorder } from "./recorder";

export const VIEW_TYPE_ECHO_PANEL = "echo-panel-view";

export class EchoPanelView extends ItemView {
	private plugin: EchoWebSyncPlugin;

	// State
	private projects: Project[] = [];
	private activeEntry: TimeEntryResponse | null = null;
	private serverTimeOffset = 0; // ms difference: server - local
	private todos: Todo[] = [];
	private dailySummary: DailySummaryResponse | null = null;

	// Recorder
	private recorder: AudioRecorder | null = null;
	private recordingState: "idle" | "recording" | "transcribing" | "done" = "idle";
	private captureType = "brain";

	// Intervals
	private timerDisplayInterval: number | null = null;
	private pollInterval: number | null = null;
	private recorderDurationInterval: number | null = null;

	// DOM refs
	private recordBtn!: HTMLElement;
	private recordDuration!: HTMLElement;
	private recordStatus!: HTMLElement;
	private timerDisplay!: HTMLElement;
	private timerControls!: HTMLElement;
	private timerInfo!: HTMLElement;
	private timerStartForm!: HTMLElement;
	private summaryBar!: HTMLElement;
	private todoList!: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: EchoWebSyncPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_ECHO_PANEL;
	}

	getDisplayText(): string {
		return "Echo Panel";
	}

	getIcon(): string {
		return "mic";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("echo-panel");

		this.buildRecordSection(container);
		this.buildTimerSection(container);
		this.buildTodoSection(container);

		// Load initial data
		if (this.plugin.api.isConfigured()) {
			await this.loadProjects();
			await this.refreshTimer();
			await this.refreshTodos();
			await this.refreshSummary();
		}

		// 1s timer display update
		this.timerDisplayInterval = window.setInterval(() => this.updateTimerDisplay(), 1000);
		this.registerInterval(this.timerDisplayInterval);

		// 10s server poll
		this.pollInterval = window.setInterval(() => this.pollServer(), 10000);
		this.registerInterval(this.pollInterval);
	}

	async onClose(): Promise<void> {
		if (this.recorder?.isRecording()) {
			this.recorder.cancel();
		}
		this.recorder = null;
	}

	// =====================================
	// RECORD SECTION
	// =====================================

	private buildRecordSection(container: HTMLElement): void {
		const section = this.createSection(container, "RECORD", true);

		const body = section.createDiv({ cls: "echo-section-body" });

		// Type picker
		const typePicker = body.createDiv({ cls: "echo-type-picker" });
		for (const t of ["brain", "task", "idea"]) {
			const btn = typePicker.createEl("button", {
				cls: `echo-type-btn ${t === this.captureType ? "active" : ""}`,
				text: t.toUpperCase(),
			});
			btn.addEventListener("click", () => {
				this.captureType = t;
				typePicker.querySelectorAll(".echo-type-btn").forEach((b) => b.removeClass("active"));
				btn.addClass("active");
			});
		}

		// Record button
		this.recordBtn = body.createDiv({ cls: "echo-record-btn" });
		this.recordBtn.createDiv({ cls: "echo-record-btn-inner" });
		this.recordBtn.addEventListener("click", () => this.toggleRecording());

		// Duration display
		this.recordDuration = body.createDiv({ cls: "echo-record-duration", text: "00:00" });

		// Status
		this.recordStatus = body.createDiv({ cls: "echo-record-status" });

		if (!AudioRecorder.isSupported()) {
			this.recordStatus.setText("Microphone not available on this device");
			this.recordBtn.addClass("disabled");
		}
	}

	private async toggleRecording(): Promise<void> {
		if (this.recordingState === "recording") {
			await this.stopRecording();
		} else if (this.recordingState === "idle" || this.recordingState === "done") {
			await this.startRecording();
		}
	}

	private async startRecording(): Promise<void> {
		try {
			this.recorder = new AudioRecorder();
			await this.recorder.start();
			this.recordingState = "recording";
			this.recordBtn.addClass("recording");
			this.recordStatus.setText("Recording...");
			this.recordDuration.setText("00:00");

			this.recorderDurationInterval = window.setInterval(() => {
				if (this.recorder) {
					const secs = this.recorder.getDuration();
					this.recordDuration.setText(this.formatDuration(secs));
				}
			}, 500);
			this.registerInterval(this.recorderDurationInterval);
		} catch (e) {
			new Notice(`Recording failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	private async stopRecording(): Promise<void> {
		if (!this.recorder) return;

		if (this.recorderDurationInterval !== null) {
			window.clearInterval(this.recorderDurationInterval);
			this.recorderDurationInterval = null;
		}

		this.recordingState = "transcribing";
		this.recordBtn.removeClass("recording");
		this.recordBtn.addClass("processing");
		this.recordStatus.setText("Transcribing...");

		try {
			const blob = await this.recorder.stop();
			const buffer = await blob.arrayBuffer();

			const result = await this.plugin.api.transcribeAudio(buffer);

			if (!result.text || result.text.trim().length === 0) {
				this.recordStatus.setText("No speech detected");
				this.recordingState = "done";
				this.recordBtn.removeClass("processing");
				return;
			}

			// Create capture
			await this.plugin.api.createCapture({
				text: result.text,
				type: this.captureType,
				audio_key: result.audio_key || undefined,
			});

			this.recordStatus.setText(`Saved: "${result.text.substring(0, 80)}${result.text.length > 80 ? "..." : ""}"`);
			this.recordingState = "done";
			this.recordBtn.removeClass("processing");

			new Notice("Capture saved!");
		} catch (e) {
			this.recordStatus.setText(`Error: ${e instanceof Error ? e.message : String(e)}`);
			this.recordingState = "idle";
			this.recordBtn.removeClass("processing");
		}
	}

	// =====================================
	// TIMER SECTION
	// =====================================

	private buildTimerSection(container: HTMLElement): void {
		const section = this.createSection(container, "TIMER", true);
		const body = section.createDiv({ cls: "echo-section-body" });

		// Timer display
		this.timerDisplay = body.createDiv({ cls: "echo-timer-display", text: "00:00:00" });

		// Timer info (description + project when running)
		this.timerInfo = body.createDiv({ cls: "echo-timer-info" });

		// Controls (shown when timer active)
		this.timerControls = body.createDiv({ cls: "echo-timer-controls" });

		// Start form (shown when no timer)
		this.timerStartForm = body.createDiv({ cls: "echo-timer-start-form" });
		this.buildTimerStartForm();

		// Daily summary bar
		this.summaryBar = body.createDiv({ cls: "echo-summary-bar" });
	}

	private buildTimerStartForm(): void {
		const form = this.timerStartForm;
		form.empty();

		// Description input
		const descInput = form.createEl("input", {
			cls: "echo-timer-input",
			attr: { placeholder: "What are you working on?", type: "text" },
		});

		// Project selector
		const projSelect = form.createEl("select", { cls: "echo-timer-select" });
		projSelect.createEl("option", { text: "(no project)", attr: { value: "" } });
		for (const p of this.projects) {
			projSelect.createEl("option", { text: p.name, attr: { value: String(p.id) } });
		}

		// Row: entry type + billable
		const optionsRow = form.createDiv({ cls: "echo-timer-options" });

		const typeSelect = optionsRow.createEl("select", { cls: "echo-timer-select small" });
		typeSelect.createEl("option", { text: "Manual", attr: { value: "manual" } });
		typeSelect.createEl("option", { text: "Pomodoro", attr: { value: "pomodoro" } });

		const billableLabel = optionsRow.createEl("label", { cls: "echo-billable-label" });
		const billableCb = billableLabel.createEl("input", { attr: { type: "checkbox" } });
		billableLabel.appendText(" Billable");

		// Start button
		const startBtn = form.createEl("button", { cls: "echo-start-btn", text: "[ START ]" });
		startBtn.addEventListener("click", async () => {
			try {
				await this.plugin.api.startTimer({
					description: descInput.value,
					project_id: projSelect.value ? parseInt(projSelect.value) : undefined,
					entry_type: typeSelect.value,
					billable: billableCb.checked,
					...(typeSelect.value === "pomodoro" ? {
						pomodoro: { work_minutes: 25, break_minutes: 5, long_break_minutes: 15, total_rounds: 4 },
					} : {}),
				});
				await this.refreshTimer();
				await this.refreshSummary();
			} catch (e) {
				new Notice(`Start failed: ${e instanceof Error ? e.message : String(e)}`);
			}
		});
	}

	private updateTimerDisplay(): void {
		if (!this.activeEntry) {
			this.timerDisplay.setText("00:00:00");
			return;
		}

		const entry = this.activeEntry;
		const accumulated = entry.duration_seconds || 0;

		let elapsed = accumulated;
		if (entry.status === "running") {
			const startMs = new Date(entry.started_at).getTime();
			const nowMs = Date.now() + this.serverTimeOffset;
			elapsed = accumulated + Math.floor((nowMs - startMs) / 1000);
		}

		if (entry.entry_type === "pomodoro" && entry.pomodoro) {
			this.renderPomodoroDisplay(entry, elapsed);
		} else {
			this.timerDisplay.setText(this.formatHMS(Math.max(0, elapsed)));
		}

		if (entry.status === "paused") {
			this.timerDisplay.addClass("paused");
		} else {
			this.timerDisplay.removeClass("paused");
		}
	}

	private renderPomodoroDisplay(entry: TimeEntryResponse, _elapsed: number): void {
		if (!entry.pomodoro) return;

		const pomo = entry.pomodoro;
		const phaseMinutes = pomo.phase === "work" ? pomo.work_minutes
			: pomo.phase === "long_break" ? pomo.long_break_minutes
			: pomo.break_minutes;
		const phaseStartMs = new Date(pomo.phase_started_at).getTime();
		const nowMs = Date.now() + this.serverTimeOffset;
		const phaseElapsed = entry.status === "running"
			? Math.floor((nowMs - phaseStartMs) / 1000)
			: 0;
		const remaining = Math.max(0, phaseMinutes * 60 - phaseElapsed);

		this.timerDisplay.setText(this.formatHMS(remaining));
	}

	private renderTimerState(): void {
		this.timerControls.empty();
		this.timerInfo.empty();

		if (!this.activeEntry) {
			this.timerStartForm.show();
			this.timerControls.hide();
			this.timerInfo.hide();
			this.timerDisplay.removeClass("paused");
			return;
		}

		this.timerStartForm.hide();
		this.timerControls.show();
		this.timerInfo.show();

		const entry = this.activeEntry;

		// Info
		if (entry.description) {
			this.timerInfo.createDiv({ cls: "echo-timer-desc", text: entry.description });
		}
		if (entry.project) {
			const projTag = this.timerInfo.createDiv({ cls: "echo-timer-project" });
			const dot = projTag.createSpan({ cls: "echo-project-dot" });
			dot.style.backgroundColor = entry.project_color || "#fa0";
			projTag.appendText(entry.project);
		}
		if (entry.entry_type === "pomodoro" && entry.pomodoro) {
			const pomo = entry.pomodoro;
			const phaseLabel = pomo.phase === "work" ? "WORK" : pomo.phase === "long_break" ? "LONG BREAK" : "BREAK";
			this.timerInfo.createDiv({
				cls: "echo-pomo-phase",
				text: `${phaseLabel} ${pomo.current_round}/${pomo.total_rounds}`,
			});
		}

		// Controls
		if (entry.status === "running") {
			this.addControlBtn("[ PAUSE ]", "echo-pause-btn", async () => {
				await this.plugin.api.pauseTimer(entry.id);
				await this.refreshTimer();
			});
			this.addControlBtn("[ STOP ]", "echo-stop-btn", async () => {
				await this.plugin.api.stopTimer(entry.id);
				await this.refreshTimer();
				await this.refreshSummary();
			});
		} else if (entry.status === "paused") {
			this.addControlBtn("[ RESUME ]", "echo-resume-btn", async () => {
				await this.plugin.api.resumeTimer(entry.id);
				await this.refreshTimer();
			});
			this.addControlBtn("[ STOP ]", "echo-stop-btn", async () => {
				await this.plugin.api.stopTimer(entry.id);
				await this.refreshTimer();
				await this.refreshSummary();
			});
			this.addControlBtn("[ CANCEL ]", "echo-cancel-btn", async () => {
				await this.plugin.api.cancelTimer(entry.id);
				await this.refreshTimer();
				await this.refreshSummary();
			});
		}

		if (entry.entry_type === "pomodoro" && entry.pomodoro && entry.pomodoro.phase !== "completed") {
			this.addControlBtn("[ NEXT ]", "echo-next-btn", async () => {
				await this.plugin.api.advancePomodoro(entry.id);
				await this.refreshTimer();
			});
		}
	}

	private addControlBtn(text: string, cls: string, onClick: () => Promise<void>): void {
		const btn = this.timerControls.createEl("button", { cls: `echo-ctrl-btn ${cls}`, text });
		btn.addEventListener("click", async () => {
			btn.disabled = true;
			try {
				await onClick();
			} catch (e) {
				new Notice(`${e instanceof Error ? e.message : String(e)}`);
			} finally {
				btn.disabled = false;
			}
		});
	}

	private renderSummary(): void {
		this.summaryBar.empty();
		if (!this.dailySummary) return;

		const total = this.dailySummary.total_duration_seconds;
		if (total === 0) return;

		const label = this.summaryBar.createDiv({
			cls: "echo-summary-label",
			text: `Today: ${this.formatHMS(total)}`,
		});

		if (this.dailySummary.project_list.length > 0) {
			const bar = this.summaryBar.createDiv({ cls: "echo-summary-projects" });
			for (const p of this.dailySummary.project_list) {
				const pct = Math.max(2, (p.seconds / total) * 100);
				const segment = bar.createDiv({ cls: "echo-summary-segment" });
				segment.style.width = `${pct}%`;
				segment.style.backgroundColor = p.color || "#fa0";
				segment.setAttribute("title", `${p.name}: ${this.formatHMS(p.seconds)}`);
			}
		}
	}

	// =====================================
	// TODOS SECTION
	// =====================================

	private buildTodoSection(container: HTMLElement): void {
		const section = this.createSection(container, "TODOS", true);
		const body = section.createDiv({ cls: "echo-section-body" });

		this.todoList = body.createDiv({ cls: "echo-todo-list" });

		// Add todo input
		const addRow = body.createDiv({ cls: "echo-todo-add" });
		const input = addRow.createEl("input", {
			cls: "echo-todo-input",
			attr: { placeholder: "Add a task...", type: "text" },
		});
		const addBtn = addRow.createEl("button", { cls: "echo-todo-add-btn", text: "[+]" });

		const doAdd = async () => {
			const text = input.value.trim();
			if (!text) return;
			try {
				await this.plugin.api.createTodo(text);
				input.value = "";
				await this.refreshTodos();
			} catch (e) {
				new Notice(`Failed: ${e instanceof Error ? e.message : String(e)}`);
			}
		};

		addBtn.addEventListener("click", doAdd);
		input.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") doAdd();
		});
	}

	private renderTodos(): void {
		this.todoList.empty();

		if (this.todos.length === 0) {
			this.todoList.createDiv({ cls: "echo-todo-empty", text: "No active todos" });
			return;
		}

		for (const todo of this.todos) {
			const item = this.todoList.createDiv({ cls: "echo-todo-item" });
			const cb = item.createEl("input", {
				attr: { type: "checkbox" },
				cls: "echo-todo-cb",
			});
			if (todo.completed) cb.checked = true;

			item.createSpan({ cls: "echo-todo-text", text: todo.text });

			cb.addEventListener("change", async () => {
				try {
					await this.plugin.api.updateTodo(todo.id, { completed: cb.checked });
					await this.refreshTodos();
				} catch (e) {
					cb.checked = !cb.checked;
					new Notice(`Failed: ${e instanceof Error ? e.message : String(e)}`);
				}
			});
		}
	}

	// =====================================
	// HELPERS
	// =====================================

	private createSection(parent: HTMLElement, title: string, defaultOpen: boolean): HTMLElement {
		const section = parent.createDiv({ cls: "echo-section" });

		const header = section.createDiv({ cls: "echo-section-header" });
		const chevron = header.createSpan({ cls: "echo-chevron", text: defaultOpen ? "\u25BC" : "\u25B6" });
		header.createSpan({ text: ` ${title}` });

		const body = section.createDiv({ cls: "echo-section-body-wrapper" });
		if (!defaultOpen) body.hide();

		header.addEventListener("click", () => {
			if (body.isShown()) {
				body.hide();
				chevron.setText("\u25B6");
			} else {
				body.show();
				chevron.setText("\u25BC");
			}
		});

		return body;
	}

	private async loadProjects(): Promise<void> {
		try {
			this.projects = await this.plugin.api.getProjects();
		} catch (e) {
			console.error("Failed to load projects:", e);
		}
	}

	private async refreshTimer(): Promise<void> {
		try {
			const resp = await this.plugin.api.getActiveTimer();
			this.activeEntry = resp.entry;

			// Calculate server time offset
			const serverNow = new Date(resp.server_now).getTime();
			this.serverTimeOffset = serverNow - Date.now();

			this.renderTimerState();
			this.updateTimerDisplay();
		} catch (e) {
			console.error("Failed to refresh timer:", e);
		}
	}

	private async refreshTodos(): Promise<void> {
		try {
			this.todos = await this.plugin.api.getTodos();
			this.todos = this.todos.filter((t) => !t.completed);
			this.renderTodos();
		} catch (e) {
			console.error("Failed to refresh todos:", e);
		}
	}

	private async refreshSummary(): Promise<void> {
		try {
			this.dailySummary = await this.plugin.api.getTodaySummary();
			this.renderSummary();
		} catch (e) {
			console.error("Failed to refresh summary:", e);
		}
	}

	private async pollServer(): Promise<void> {
		if (!this.plugin.api.isConfigured()) return;
		await this.refreshTimer();
		await this.refreshTodos();
		await this.refreshSummary();
	}

	private formatHMS(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}

	private formatDuration(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}
}
