import { Notice } from "obsidian";
import type { EchoApi } from "./api";
import type { DailyNoteManager } from "./daily-notes";
import type { MeetingNoteManager } from "./meeting-notes";
import type { TodoSync } from "./todo-sync";
import type { Capture, EchoSettings } from "./types";
import { formatCapture, formatDate } from "./formatter";

export interface SyncResult {
	synced: number;
	todos: number;
	errors: number;
	hasMore: boolean;
}

export class SyncEngine {
	private api: EchoApi;
	private dailyNotes: DailyNoteManager;
	private meetingNotes: MeetingNoteManager;
	private todoSync: TodoSync;
	private settings: EchoSettings;
	private running = false;

	constructor(
		api: EchoApi,
		dailyNotes: DailyNoteManager,
		meetingNotes: MeetingNoteManager,
		todoSync: TodoSync,
		settings: EchoSettings,
	) {
		this.api = api;
		this.dailyNotes = dailyNotes;
		this.meetingNotes = meetingNotes;
		this.todoSync = todoSync;
		this.settings = settings;
	}

	updateSettings(settings: EchoSettings): void {
		this.settings = settings;
	}

	isRunning(): boolean {
		return this.running;
	}

	async sync(
		onProgress?: (msg: string) => void,
	): Promise<SyncResult> {
		if (this.running) {
			return { synced: 0, todos: 0, errors: 0, hasMore: false };
		}

		this.running = true;
		let totalSynced = 0;
		let totalTodos = 0;
		let totalErrors = 0;
		let hasMore = true;

		try {
			// Default to epoch if no last sync
			const since =
				this.settings.lastSyncTimestamp || "2000-01-01T00:00:00Z";

			while (hasMore) {
				onProgress?.(`Fetching captures since ${since}...`);

				const response = await this.api.syncCaptures(since, 100);
				hasMore = response.has_more;

				if (response.captures.length === 0) {
					hasMore = false;
					break;
				}

				// Group captures by date
				const byDate = new Map<string, Capture[]>();
				for (const capture of response.captures) {
					const dateStr = formatDate(capture.created_at);
					const group = byDate.get(dateStr) || [];
					group.push(capture);
					byDate.set(dateStr, group);
				}

				// Process each date group
				for (const [dateStr, captures] of byDate) {
					try {
						await this.processDateGroup(dateStr, captures);
					} catch (e) {
						console.error(
							`Echo sync error for ${dateStr}:`,
							e,
						);
						totalErrors += captures.length;
						continue;
					}
				}

				// Mark captures as synced and track latest timestamp
				for (const capture of response.captures) {
					try {
						await this.api.markSynced(capture.id);
						totalSynced++;

						// Track the latest timestamp
						if (
							!this.settings.lastSyncTimestamp ||
							capture.created_at >
								this.settings.lastSyncTimestamp
						) {
							this.settings.lastSyncTimestamp =
								capture.created_at;
						}
					} catch (e) {
						console.error(
							`Echo: failed to mark ${capture.id} as synced:`,
							e,
						);
						totalErrors++;
					}
				}

				onProgress?.(
					`Synced ${totalSynced} captures...`,
				);
			}

			// Two-way todo sync
			if (this.settings.syncTodos) {
				onProgress?.("Syncing todos (two-way)...");
				try {
					const todoResult = await this.todoSync.sync(onProgress);
					totalTodos = todoResult.created + todoResult.updated;
					totalErrors += todoResult.errors;
				} catch (e) {
					console.error("Echo todo sync error:", e);
					totalErrors++;
				}
			}
		} finally {
			this.running = false;
		}

		return {
			synced: totalSynced,
			todos: totalTodos,
			errors: totalErrors,
			hasMore: false,
		};
	}

	private async processDateGroup(
		dateStr: string,
		captures: Capture[],
	): Promise<void> {
		const dailyNote =
			await this.dailyNotes.getOrCreateDailyNote(dateStr);

		for (const capture of captures) {
			if (capture.type === "meeting") {
				// Create meeting note + add link in daily note
				await this.meetingNotes.createMeetingNote(capture);
				const link =
					this.meetingNotes.getMeetingDailyLink(capture);
				await this.dailyNotes.appendToSection(
					dailyNote,
					link,
				);
			} else {
				// brain, task, idea → daily note
				const formatted = formatCapture(
					capture,
					this.settings,
					this.api,
				);
				await this.dailyNotes.appendToSection(
					dailyNote,
					formatted,
				);
			}
		}
	}
}
