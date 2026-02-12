export interface EchoSettings {
	serverUrl: string;
	token: string;
	username: string;
	syncIntervalMinutes: number;
	lastSyncTimestamp: string;
	sectionHeader: string;
	dailyNoteFolder: string;
	meetingFolder: string;
	showAudioLinks: boolean;
	showLocation: boolean;
	showTags: boolean;
	syncTodos: boolean;
	todoSectionHeader: string;
}

export const DEFAULT_SETTINGS: EchoSettings = {
	serverUrl: "",
	token: "",
	username: "",
	syncIntervalMinutes: 5,
	lastSyncTimestamp: "",
	sectionHeader: "#### \u{1F9E0}",
	dailyNoteFolder: "Journal/Daily",
	meetingFolder: "Moten",
	showAudioLinks: true,
	showLocation: true,
	showTags: true,
	syncTodos: true,
	todoSectionHeader: "#### \u{2705}",
};

export interface Capture {
	id: number;
	text: string;
	type: string;
	language: string;
	meeting_title: string | null;
	has_audio: boolean;
	tags: string[];
	pinned: boolean;
	reviewed: boolean;
	synced: boolean;
	location_lat: number | null;
	location_lng: number | null;
	location_address: string | null;
	time_entry_id: number | null;
	created_at: string;
}

export interface SyncResponse {
	captures: Capture[];
	has_more: boolean;
}

export interface SyncPendingResponse {
	count: number;
	oldest: string | null;
}

export interface SyncMarkResponse {
	id: number;
	synced: boolean;
	synced_at: string;
}

export interface LoginResponse {
	token: string;
	username: string;
}

export interface AuthMeResponse {
	username: string;
	user_count: number;
}

export interface Todo {
	id: number;
	text: string;
	completed: boolean;
	archived: boolean;
	position: number;
	created_at: string;
	completed_at: string | null;
}

// --- Time tracking types ---

export interface PomodoroState {
	work_minutes: number;
	break_minutes: number;
	long_break_minutes: number;
	total_rounds: number;
	current_round: number;
	phase: string; // work | break | long_break | completed
	phase_started_at: string;
}

export interface TimeEntryResponse {
	id: number;
	description: string;
	project: string | null;
	project_id: number | null;
	project_color: string | null;
	tags: string[];
	started_at: string;
	ended_at: string | null;
	duration_seconds: number | null;
	status: string; // running | paused | completed | cancelled
	entry_type: string; // manual | pomodoro
	pomodoro: PomodoroState | null;
	capture_id: number | null;
	billable: boolean;
	created_at: string;
}

export interface ActiveTimerResponse {
	entry: TimeEntryResponse | null;
	server_now: string;
}

export interface ProjectSummary {
	id: number | null;
	name: string;
	color: string;
	seconds: number;
}

export interface DailySummaryResponse {
	date: string;
	total_duration_seconds: number;
	billable_seconds: number;
	project_list: ProjectSummary[];
}

export interface Project {
	id: number;
	name: string;
	color: string;
	archived: boolean;
	created_at: string;
}

export interface StartTimerRequest {
	description: string;
	project_id?: number;
	entry_type: string; // manual | pomodoro
	pomodoro?: { work_minutes: number; break_minutes: number; long_break_minutes: number; total_rounds: number };
	billable: boolean;
}

export interface TranscribeResponse {
	text: string;
	confidence: number;
	duration_ms: number;
	backend_used: string;
	audio_key: string | null;
}

export interface CreateCaptureRequest {
	text: string;
	type: string; // brain | task | idea
	audio_key?: string;
	time_entry_id?: number;
}
