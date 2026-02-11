import type { Capture, Todo, EchoSettings } from "./types";
import type { EchoApi } from "./api";

export function formatCapture(
	capture: Capture,
	settings: EchoSettings,
	api: EchoApi,
): string {
	const time = formatTime(capture.created_at);
	const lines: string[] = [];

	if (capture.type === "task") {
		lines.push(`- [ ] ${capture.text.trim()}`);
	} else {
		const tagStr =
			settings.showTags && capture.tags.length > 0
				? " " + capture.tags.map((t) => `#${t}`).join(" ")
				: "";
		lines.push(`- **${time}** ${capture.text.trim()}${tagStr}`);
	}

	if (settings.showLocation && capture.location_address) {
		lines.push(`  \u{1F4CD} ${capture.location_address}`);
	}

	if (settings.showAudioLinks && capture.has_audio) {
		const audioUrl = api.getAudioUrl(capture.id);
		lines.push(`  \u{1F3B5} [Lyssna](${audioUrl})`);
	}

	lines.push(`  <!-- echo-id:${capture.id} -->`);

	return lines.join("\n");
}

function formatTime(isoString: string): string {
	const d = new Date(isoString);
	const h = String(d.getHours()).padStart(2, "0");
	const m = String(d.getMinutes()).padStart(2, "0");
	return `${h}:${m}`;
}

export function formatDate(isoString: string): string {
	const d = new Date(isoString);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function formatMeetingFilename(capture: Capture): string {
	const d = new Date(capture.created_at);
	const date = formatDate(capture.created_at);
	const h = String(d.getHours()).padStart(2, "0");
	const m = String(d.getMinutes()).padStart(2, "0");
	const title = capture.meeting_title
		? sanitizeFilename(capture.meeting_title)
		: "Mote";
	return `${date}_${h}${m}_${title}`;
}

export function formatTodo(todo: Todo): string {
	const checkbox = todo.completed ? "- [x]" : "- [ ]";
	return `${checkbox} ${todo.text.trim()} <!-- echo-todo:${todo.id} -->`;
}

function sanitizeFilename(name: string): string {
	return name
		.replace(/[\\/:*?"<>|]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.substring(0, 60);
}
