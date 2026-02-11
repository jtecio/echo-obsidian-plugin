import { App, TFile, normalizePath } from "obsidian";
import type { Capture, EchoSettings } from "./types";
import type { EchoApi } from "./api";
import { formatDate, formatMeetingFilename } from "./formatter";

export class MeetingNoteManager {
	private app: App;
	private settings: EchoSettings;
	private api: EchoApi;

	constructor(app: App, settings: EchoSettings, api: EchoApi) {
		this.app = app;
		this.settings = settings;
		this.api = api;
	}

	updateSettings(settings: EchoSettings, api: EchoApi): void {
		this.settings = settings;
		this.api = api;
	}

	async createMeetingNote(capture: Capture): Promise<TFile> {
		const filename = formatMeetingFilename(capture);
		const folderPath = normalizePath(this.settings.meetingFolder);
		const filePath = normalizePath(`${folderPath}/${filename}.md`);

		// Check if already exists
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			// Check for echo-id to avoid overwriting
			const content = await this.app.vault.read(existing);
			if (content.contains(`<!-- echo-id:${capture.id} -->`)) {
				return existing; // Already created
			}
		}

		// Ensure folder exists
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			await this.app.vault.createFolder(folderPath);
		}

		const content = this.buildMeetingContent(capture);
		return await this.app.vault.create(filePath, content);
	}

	private buildMeetingContent(capture: Capture): string {
		const date = formatDate(capture.created_at);
		const d = new Date(capture.created_at);
		const h = String(d.getHours()).padStart(2, "0");
		const m = String(d.getMinutes()).padStart(2, "0");
		const time = `${h}:${m}`;
		const title = capture.meeting_title || "Mote";

		const lines: string[] = [
			"---",
			"type: meeting",
			`date: ${date}`,
			"project: ",
			"people: []",
			`created: ${date} ${time}`,
			"decisions: []",
			"---",
			"",
			`# Mote - ${date} ${time}`,
			"",
		];

		if (title !== "Mote") {
			lines.push(`**${title}**`, "");
		}

		lines.push("## Transkription", "", capture.text.trim(), "");

		if (this.settings.showAudioLinks && capture.has_audio) {
			const audioUrl = this.api.getAudioUrl(capture.id);
			lines.push(
				"## Inspelning",
				"",
				`\u{1F3B5} [Lyssna](${audioUrl})`,
				"",
			);
		}

		lines.push(`<!-- echo-id:${capture.id} -->`, "");

		return lines.join("\n");
	}

	getMeetingDailyLink(capture: Capture): string {
		const filename = formatMeetingFilename(capture);
		const d = new Date(capture.created_at);
		const h = String(d.getHours()).padStart(2, "0");
		const m = String(d.getMinutes()).padStart(2, "0");
		const title = capture.meeting_title || "Mote";
		return `- **${h}:${m}** Mote: [[${this.settings.meetingFolder}/${filename}|${title}]]\n  <!-- echo-id:${capture.id} -->`;
	}
}
