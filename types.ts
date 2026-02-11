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
