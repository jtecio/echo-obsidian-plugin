import { App, TFile, TFolder, normalizePath } from "obsidian";
import type { EchoApi } from "./api";
import type { DailyNoteManager } from "./daily-notes";
import type { EchoSettings, Todo } from "./types";
import { formatDate } from "./formatter";

const ECHO_TODO_MARKER = /#📼t ?(\d+)/;
const ECHO_TODO_MARKER_OLD = /<!-- echo-todo:(\d+) -->/;
const MIC_EMOJI = "\u{1F3A4}"; // 🎤
const TODO_LINE_RE = /^- \[([ x\/])\] /;

interface ObsidianTodo {
	text: string;
	completed: boolean;
	echoId: number | null;
	line: string;
	lineIndex: number;
}

export interface TodoSyncResult {
	created: number;
	updated: number;
	errors: number;
}

export class TodoSync {
	private app: App;
	private api: EchoApi;
	private dailyNotes: DailyNoteManager;
	private settings: EchoSettings;

	constructor(app: App, api: EchoApi, dailyNotes: DailyNoteManager, settings: EchoSettings) {
		this.app = app;
		this.api = api;
		this.dailyNotes = dailyNotes;
		this.settings = settings;
	}

	updateSettings(settings: EchoSettings, api: EchoApi): void {
		this.settings = settings;
		this.api = api;
	}

	async sync(onProgress?: (msg: string) => void): Promise<TodoSyncResult> {
		let created = 0;
		let updated = 0;
		let errors = 0;

		// 1. Get all todos from Echo Web
		onProgress?.("Fetching todos from Echo Web...");
		const echoTodos = await this.api.getTodos();

		// 2. Scan recent daily notes for 🎤 tasks
		onProgress?.("Scanning daily notes for tasks...");
		const noteTodos = await this.scanDailyNotes();

		// 3. Build lookup of Echo Web todos by ID
		const echoById = new Map<number, Todo>();
		for (const t of echoTodos) {
			echoById.set(t.id, t);
		}

		// 4. Process Obsidian → Echo Web
		for (const [filePath, todos] of noteTodos) {
			for (const ot of todos) {
				try {
					if (ot.echoId) {
						// Existing synced todo - check status
						const echoTodo = echoById.get(ot.echoId);
						if (echoTodo && echoTodo.completed !== ot.completed) {
							// Obsidian status differs → update Echo Web
							await this.api.updateTodo(ot.echoId, { completed: ot.completed });
							updated++;
						}
						// Remove from map (processed)
						echoById.delete(ot.echoId);
					} else {
						// New 🎤 task without echo-todo marker → create in Echo Web
						const newTodo = await this.api.createTodo(ot.text);
						// Update the line in Obsidian to add the marker
						await this.addMarkerToLine(filePath, ot.lineIndex, ot.line, newTodo.id);
						created++;
					}
				} catch (e) {
					console.error(`Echo todo sync error for "${ot.text}":`, e);
					errors++;
				}
			}

			// Remove processed echo IDs from remaining
			for (const ot of todos) {
				if (ot.echoId) echoById.delete(ot.echoId);
			}
		}

		// 5. Echo Web → Obsidian: write all todos to today's daily note
		onProgress?.("Writing todos to daily note...");
		const allEchoTodos = await this.api.getTodos(); // Re-fetch to get updated state
		await this.writeTodosToDaily(allEchoTodos.filter(t => !t.archived && !t.completed));

		return { created, updated, errors };
	}

	/**
	 * Scan daily notes in the configured folder for 🎤 tasks.
	 * Scans notes from last 14 days to catch tasks on future/past dates.
	 */
	private async scanDailyNotes(): Promise<Map<string, ObsidianTodo[]>> {
		const result = new Map<string, ObsidianTodo[]>();
		const folder = this.settings.dailyNoteFolder || "Journal/Daily";

		// Get all markdown files in daily note folder
		const allFiles = this.app.vault.getMarkdownFiles();
		const dailyFiles = allFiles.filter(f => f.path.startsWith(folder + "/"));

		// Sort by modification time (newest first) and limit to recent
		const recentFiles = dailyFiles
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, 30); // Last 30 modified daily notes

		for (const file of recentFiles) {
			const content = await this.app.vault.read(file);
			const todos = this.parseTodosFromContent(content);
			if (todos.length > 0) {
				result.set(file.path, todos);
			}
		}

		return result;
	}

	/**
	 * Parse all 🎤 tasks from a note's content.
	 */
	private parseTodosFromContent(content: string): ObsidianTodo[] {
		const todos: ObsidianTodo[] = [];
		const lines = content.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Must be a task line with 🎤
			if (!TODO_LINE_RE.test(line) || !line.includes(MIC_EMOJI)) continue;

			const checkMatch = line.match(TODO_LINE_RE);
			if (!checkMatch) continue;

			const completed = checkMatch[1] === "x";

			// Check for echo-todo marker (new #📼tN or old <!-- echo-todo:N -->)
			const markerMatch = line.match(ECHO_TODO_MARKER) || line.match(ECHO_TODO_MARKER_OLD);
			const echoId = markerMatch ? parseInt(markerMatch[1]) : null;

			// Extract text: after checkbox, remove 🎤 and markers
			let text = line
				.replace(TODO_LINE_RE, "")
				.replace(MIC_EMOJI, "")
				.replace(ECHO_TODO_MARKER, "")
				.replace(ECHO_TODO_MARKER_OLD, "")
				.trim();

			todos.push({
				text,
				completed,
				echoId,
				line,
				lineIndex: i,
			});
		}

		return todos;
	}

	/**
	 * Add <!-- echo-todo:N --> marker to a line in a file.
	 */
	private async addMarkerToLine(filePath: string, lineIndex: number, originalLine: string, todoId: number): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		const lines = content.split("\n");

		if (lineIndex < lines.length && lines[lineIndex] === originalLine) {
			lines[lineIndex] = `${originalLine} #📼t ${todoId}`;
			await this.app.vault.modify(file, lines.join("\n"));
		}
	}

	/**
	 * Write all Echo Web todos to today's daily note todo section.
	 */
	private async writeTodosToDaily(todos: Todo[]): Promise<void> {
		if (todos.length === 0) return;

		const today = formatDate(new Date().toISOString());
		const dailyNote = await this.dailyNotes.getOrCreateDailyNote(today);

		const todoLines = todos
			.sort((a, b) => a.position - b.position)
			.map(t => {
				const checkbox = t.completed ? "- [x]" : "- [ ]";
				return `${checkbox} ${MIC_EMOJI} ${t.text.trim()} #📼t ${t.id}`;
			})
			.join("\n");

		await this.dailyNotes.replaceTodoSection(dailyNote, todoLines);
	}
}
