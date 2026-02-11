import { App, TFile, TFolder, normalizePath } from "obsidian";
import type { EchoSettings } from "./types";

export class DailyNoteManager {
	private app: App;
	private settings: EchoSettings;

	constructor(app: App, settings: EchoSettings) {
		this.app = app;
		this.settings = settings;
	}

	updateSettings(settings: EchoSettings): void {
		this.settings = settings;
	}

	async getOrCreateDailyNote(dateStr: string): Promise<TFile> {
		const year = dateStr.substring(0, 4);
		let folder = this.settings.dailyNoteFolder || "Journal/Daily";
		// Strip trailing year if user already included it (e.g. "Journal/Daily/2026")
		if (folder.endsWith(`/${year}`)) {
			folder = folder.substring(0, folder.length - year.length - 1);
		}
		const path = normalizePath(`${folder}/${year}/${dateStr}.md`);

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			return existing;
		}

		// Ensure directory exists
		const dirPath = normalizePath(`${folder}/${year}`);
		const dir = this.app.vault.getAbstractFileByPath(dirPath);
		if (!dir) {
			// Create parent folders recursively
			const parts = dirPath.split("/");
			let current = "";
			for (const part of parts) {
				current = current ? `${current}/${part}` : part;
				const normalized = normalizePath(current);
				if (!this.app.vault.getAbstractFileByPath(normalized)) {
					await this.app.vault.createFolder(normalized);
				}
			}
		}

		const content = this.createDailyNoteContent(dateStr);
		return await this.app.vault.create(path, content);
	}

	private createDailyNoteContent(dateStr: string): string {
		const sections = [
			"---",
			"typ: Daily",
			"status: Active",
			`date: ${dateStr}`,
			"---",
			"",
			`# ${dateStr}`,
			"",
			this.settings.sectionHeader,
			"",
		];

		if (this.settings.syncTodos && this.settings.todoSectionHeader) {
			sections.push(this.settings.todoSectionHeader, "");
		}

		sections.push("#### \u{1F916}", "");

		return sections.join("\n");
	}

	async appendToSection(file: TFile, entry: string, sectionHeader?: string): Promise<void> {
		const content = await this.app.vault.read(file);

		// Check for duplicate (support both old and new marker format)
		const newMarker = entry.match(/#📼 ?(\d+)/);
		const oldMarker = entry.match(/<!-- echo-id:(\d+) -->/);
		const markerId = newMarker?.[1] || oldMarker?.[1];
		if (markerId && (content.includes(`#📼 ${markerId}`) || content.includes(`#📼${markerId}`) || content.includes(`<!-- echo-id:${markerId} -->`))) {
			return; // Already synced
		}

		const header = sectionHeader || this.settings.sectionHeader;
		const headerIndex = content.indexOf(header);

		if (headerIndex === -1) {
			// Section doesn't exist - append it at end
			const newContent = content.trimEnd() + "\n\n" + header + "\n\n" + entry + "\n";
			await this.app.vault.modify(file, newContent);
			return;
		}

		// Find where to insert: after the header line, before the next section
		const afterHeader = headerIndex + header.length;
		const rest = content.substring(afterHeader);

		// Find next section header (#### or ## or #)
		const nextSectionMatch = rest.match(/\n(#{1,4} )/);
		let insertPos: number;

		if (nextSectionMatch && nextSectionMatch.index !== undefined) {
			// Insert before the next section
			insertPos = afterHeader + nextSectionMatch.index;
		} else {
			// No next section - append at end
			insertPos = content.length;
		}

		// Ensure proper spacing
		const before = content.substring(0, insertPos).trimEnd();
		const after = content.substring(insertPos);

		const newContent = before + "\n\n" + entry + "\n" + after;
		await this.app.vault.modify(file, newContent);
	}

	hasEchoId(content: string, echoId: number): boolean {
		return content.contains(`<!-- echo-id:${echoId} -->`);
	}

	async replaceTodoSection(file: TFile, todoEntries: string): Promise<void> {
		const content = await this.app.vault.read(file);
		const header = this.settings.todoSectionHeader;
		const headerIndex = content.indexOf(header);

		if (headerIndex === -1) {
			// Section doesn't exist — add it before robot section or at end
			const robotHeader = "#### \u{1F916}";
			const robotIndex = content.indexOf(robotHeader);
			if (robotIndex !== -1) {
				const before = content.substring(0, robotIndex).trimEnd();
				const after = content.substring(robotIndex);
				const newContent = before + "\n\n" + header + "\n\n" + todoEntries + "\n\n" + after;
				await this.app.vault.modify(file, newContent);
			} else {
				const newContent = content.trimEnd() + "\n\n" + header + "\n\n" + todoEntries + "\n";
				await this.app.vault.modify(file, newContent);
			}
			return;
		}

		// Find the section boundaries
		const afterHeader = headerIndex + header.length;
		const rest = content.substring(afterHeader);
		const nextSectionMatch = rest.match(/\n(#{1,4} )/);

		let sectionEnd: number;
		if (nextSectionMatch && nextSectionMatch.index !== undefined) {
			sectionEnd = afterHeader + nextSectionMatch.index;
		} else {
			sectionEnd = content.length;
		}

		// Replace section content
		const before = content.substring(0, afterHeader);
		const after = content.substring(sectionEnd);
		const newContent = before + "\n\n" + todoEntries + "\n" + after;
		await this.app.vault.modify(file, newContent);
	}
}
