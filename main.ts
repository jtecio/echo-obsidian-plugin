import { Notice, Plugin } from "obsidian";
import { EchoApi } from "./api";
import { DailyNoteManager } from "./daily-notes";
import { MeetingNoteManager } from "./meeting-notes";
import { SyncEngine } from "./sync";
import { TodoSync } from "./todo-sync";
import { EchoSettingTab } from "./settings";
import { DEFAULT_SETTINGS, type EchoSettings } from "./types";
import { EchoPanelView, VIEW_TYPE_ECHO_PANEL } from "./view";

export default class EchoWebSyncPlugin extends Plugin {
	settings: EchoSettings = DEFAULT_SETTINGS;
	api: EchoApi = new EchoApi("", "");

	private dailyNotes!: DailyNoteManager;
	private meetingNotes!: MeetingNoteManager;
	private syncEngine!: SyncEngine;
	private todoSync!: TodoSync;
	private autoSyncInterval: number | null = null;
	private statusBarEl: HTMLElement | null = null;
	private ribbonEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.api = new EchoApi(this.settings.serverUrl, this.settings.token);
		this.dailyNotes = new DailyNoteManager(this.app, this.settings);
		this.meetingNotes = new MeetingNoteManager(
			this.app,
			this.settings,
			this.api,
		);
		this.todoSync = new TodoSync(
			this.app,
			this.api,
			this.dailyNotes,
			this.settings,
		);
		this.syncEngine = new SyncEngine(
			this.api,
			this.dailyNotes,
			this.meetingNotes,
			this.todoSync,
			this.settings,
		);

		// Settings tab
		this.addSettingTab(new EchoSettingTab(this.app, this));

		// Register panel view
		this.registerView(VIEW_TYPE_ECHO_PANEL, (leaf) => new EchoPanelView(leaf, this));

		// Ribbon icon — opens panel
		this.ribbonEl = this.addRibbonIcon(
			"mic",
			"Echo Panel",
			async () => {
				await this.activateView();
			},
		);

		// Status bar
		this.statusBarEl = this.addStatusBarItem();
		this.updateStatusBar("idle");

		// Commands
		this.addCommand({
			id: "echo-open-panel",
			name: "Open Echo Panel",
			callback: async () => {
				await this.activateView();
			},
		});

		this.addCommand({
			id: "echo-sync-now",
			name: "Sync Now",
			callback: async () => {
				await this.syncNow();
			},
		});

		this.addCommand({
			id: "echo-check-pending",
			name: "Check Pending Captures",
			callback: async () => {
				await this.checkPending();
			},
		});

		// Start auto-sync
		if (this.api.isConfigured()) {
			this.startAutoSync();
		}
	}

	onunload(): void {
		this.stopAutoSync();
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_ECHO_PANEL);
	}

	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_ECHO_PANEL);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_ECHO_PANEL, active: true });
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Update dependent objects
		this.dailyNotes?.updateSettings(this.settings);
		this.meetingNotes?.updateSettings(this.settings, this.api);
		this.todoSync?.updateSettings(this.settings, this.api);
		this.syncEngine?.updateSettings(this.settings);
	}

	startAutoSync(): void {
		this.stopAutoSync();
		const ms = this.settings.syncIntervalMinutes * 60 * 1000;
		this.autoSyncInterval = window.setInterval(async () => {
			if (this.api.isConfigured()) {
				await this.runSync(false);
			}
		}, ms);
		this.registerInterval(this.autoSyncInterval);
	}

	stopAutoSync(): void {
		if (this.autoSyncInterval !== null) {
			window.clearInterval(this.autoSyncInterval);
			this.autoSyncInterval = null;
		}
	}

	restartAutoSync(): void {
		this.startAutoSync();
	}

	async syncNow(): Promise<void> {
		if (!this.api.isConfigured()) {
			new Notice("Echo Web: Not logged in. Configure in settings.");
			return;
		}
		await this.runSync(true);
	}

	private async runSync(showNotice: boolean): Promise<void> {
		if (this.syncEngine.isRunning()) {
			if (showNotice) new Notice("Echo: Sync already running");
			return;
		}

		this.updateStatusBar("syncing");
		this.setRibbonSyncing(true);

		try {
			const result = await this.syncEngine.sync((msg) => {
				this.updateStatusBar("syncing", msg);
			});

			await this.saveSettings(); // Persist lastSyncTimestamp

			if (result.synced > 0 || result.todos > 0 || showNotice) {
				const parts: string[] = [];
				if (result.synced > 0) parts.push(`${result.synced} capture${result.synced !== 1 ? "s" : ""}`);
				if (result.todos > 0) parts.push(`${result.todos} todo${result.todos !== 1 ? "s" : ""}`);
				const msg = parts.length > 0
					? `Echo: Synced ${parts.join(", ")}`
					: "Echo: No new captures";
				if (result.errors > 0) {
					new Notice(
						`${msg} (${result.errors} error${result.errors !== 1 ? "s" : ""})`,
					);
				} else if (showNotice) {
					new Notice(msg);
				}
			}

			this.updateStatusBar("ok", `${result.synced} synced`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			console.error("Echo sync error:", e);
			if (showNotice) {
				new Notice(`Echo sync failed: ${msg}`);
			}
			this.updateStatusBar("error", msg);
		} finally {
			this.setRibbonSyncing(false);
		}
	}

	private async checkPending(): Promise<void> {
		if (!this.api.isConfigured()) {
			new Notice("Echo Web: Not logged in.");
			return;
		}
		try {
			const pending = await this.api.syncPending();
			if (pending.count > 0) {
				new Notice(
					`Echo: ${pending.count} pending capture${pending.count !== 1 ? "s" : ""} (oldest: ${pending.oldest})`,
				);
			} else {
				new Notice("Echo: All captures synced");
			}
		} catch (e) {
			new Notice(
				`Echo: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}

	private updateStatusBar(
		status: "idle" | "syncing" | "ok" | "error",
		detail?: string,
	): void {
		if (!this.statusBarEl) return;

		const dotColor =
			status === "ok"
				? "green"
				: status === "syncing"
					? "yellow"
					: status === "error"
						? "red"
						: "green";

		const text =
			status === "syncing"
				? "syncing..."
				: status === "error"
					? "error"
					: detail || "ready";

		this.statusBarEl.innerHTML = `<span class="echo-sync-badge"><span class="dot ${dotColor}"></span>Echo: ${text}</span>`;
	}

	private setRibbonSyncing(syncing: boolean): void {
		if (!this.ribbonEl) return;
		if (syncing) {
			this.ribbonEl.addClass("echo-syncing");
		} else {
			this.ribbonEl.removeClass("echo-syncing");
		}
	}
}
