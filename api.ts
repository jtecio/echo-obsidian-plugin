import { requestUrl, RequestUrlParam } from "obsidian";
import type {
	Capture,
	SyncResponse,
	SyncPendingResponse,
	SyncMarkResponse,
	LoginResponse,
	AuthMeResponse,
	Todo,
	TimeEntryResponse,
	ActiveTimerResponse,
	DailySummaryResponse,
	Project,
	StartTimerRequest,
	TranscribeResponse,
	CreateCaptureRequest,
} from "./types";

export class EchoApi {
	private serverUrl: string;
	private token: string;

	constructor(serverUrl: string, token: string) {
		this.serverUrl = serverUrl.replace(/\/+$/, "");
		this.token = token;
	}

	setToken(token: string): void {
		this.token = token;
	}

	setServerUrl(url: string): void {
		this.serverUrl = url.replace(/\/+$/, "");
	}

	private async request<T>(
		method: string,
		path: string,
		body?: Record<string, unknown>,
		requireAuth = true,
	): Promise<T> {
		const params: RequestUrlParam = {
			url: `${this.serverUrl}${path}`,
			method,
			headers: {
				"Content-Type": "application/json",
			},
		};

		if (requireAuth && this.token) {
			params.headers!["Authorization"] = `Bearer ${this.token}`;
		}

		if (body) {
			params.body = JSON.stringify(body);
		}

		const response = await requestUrl(params);

		if (response.status >= 400) {
			throw new Error(
				`Echo API ${method} ${path}: ${response.status} ${response.text}`,
			);
		}

		return response.json as T;
	}

	async login(username: string, password: string): Promise<LoginResponse> {
		return this.request<LoginResponse>(
			"POST",
			"/api/auth/login",
			{ username, password },
			false,
		);
	}

	async me(): Promise<AuthMeResponse> {
		return this.request<AuthMeResponse>("GET", "/api/auth/me");
	}

	async syncCaptures(since: string, limit = 100): Promise<SyncResponse> {
		const params = new URLSearchParams({
			since,
			limit: String(limit),
		});
		return this.request<SyncResponse>(
			"GET",
			`/api/sync?${params.toString()}`,
		);
	}

	async markSynced(captureId: number): Promise<SyncMarkResponse> {
		return this.request<SyncMarkResponse>(
			"PATCH",
			`/api/captures/${captureId}/synced`,
		);
	}

	async syncPending(): Promise<SyncPendingResponse> {
		return this.request<SyncPendingResponse>("GET", "/api/sync/pending");
	}

	getServerUrl(): string {
		return this.serverUrl;
	}

	getAudioUrl(captureId: number): string {
		return `${this.serverUrl}/api/captures/${captureId}/audio?token=${encodeURIComponent(this.token)}`;
	}

	async getTodos(includeArchived = false): Promise<Todo[]> {
		const params = includeArchived ? "?include_archived=true" : "";
		const resp = await this.request<{ todos: Todo[]; total: number; completed_count: number }>(
			"GET",
			`/api/todos${params}`,
		);
		return resp.todos;
	}

	async createTodo(text: string): Promise<Todo> {
		return this.request<Todo>("POST", "/api/todos", { text });
	}

	async updateTodo(id: number, updates: { text?: string; completed?: boolean }): Promise<Todo> {
		return this.request<Todo>("PATCH", `/api/todos/${id}`, updates as Record<string, unknown>);
	}

	isConfigured(): boolean {
		return this.serverUrl.length > 0 && this.token.length > 0;
	}

	// --- Time tracking ---

	async startTimer(opts: StartTimerRequest): Promise<TimeEntryResponse> {
		return this.request<TimeEntryResponse>("POST", "/api/time/start", opts as unknown as Record<string, unknown>);
	}

	async stopTimer(id: number): Promise<TimeEntryResponse> {
		return this.request<TimeEntryResponse>("POST", `/api/time/${id}/stop`);
	}

	async pauseTimer(id: number): Promise<TimeEntryResponse> {
		return this.request<TimeEntryResponse>("POST", `/api/time/${id}/pause`);
	}

	async resumeTimer(id: number): Promise<TimeEntryResponse> {
		return this.request<TimeEntryResponse>("POST", `/api/time/${id}/resume`);
	}

	async cancelTimer(id: number): Promise<TimeEntryResponse> {
		return this.request<TimeEntryResponse>("POST", `/api/time/${id}/cancel`);
	}

	async getActiveTimer(): Promise<ActiveTimerResponse> {
		return this.request<ActiveTimerResponse>("GET", "/api/time/active");
	}

	async getTodaySummary(): Promise<DailySummaryResponse> {
		return this.request<DailySummaryResponse>("GET", "/api/time/today");
	}

	async advancePomodoro(id: number): Promise<TimeEntryResponse> {
		return this.request<TimeEntryResponse>("POST", `/api/time/${id}/pomodoro/next`);
	}

	// --- Projects ---

	async getProjects(): Promise<Project[]> {
		return this.request<Project[]>("GET", "/api/projects/");
	}

	// --- Recording / Transcription ---

	async transcribeAudio(audioData: ArrayBuffer, language = "sv"): Promise<TranscribeResponse> {
		// Obsidian's requestUrl doesn't support FormData, so manually construct multipart
		const boundary = "----EchoBoundary" + Date.now();
		const encoder = new TextEncoder();

		const fieldHeader = encoder.encode(
			`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`
		);
		const fileHeader = encoder.encode(
			`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="recording.webm"\r\nContent-Type: audio/webm\r\n\r\n`
		);
		const fileData = new Uint8Array(audioData);
		const closing = encoder.encode(`\r\n--${boundary}--\r\n`);

		// Concatenate all parts
		const body = new Uint8Array(fieldHeader.length + fileHeader.length + fileData.length + closing.length);
		let offset = 0;
		body.set(fieldHeader, offset); offset += fieldHeader.length;
		body.set(fileHeader, offset); offset += fileHeader.length;
		body.set(fileData, offset); offset += fileData.length;
		body.set(closing, offset);

		const response = await requestUrl({
			url: `${this.serverUrl}/api/transcribe`,
			method: "POST",
			headers: {
				"Content-Type": `multipart/form-data; boundary=${boundary}`,
				"Authorization": `Bearer ${this.token}`,
			},
			body: body.buffer,
		});

		if (response.status >= 400) {
			throw new Error(`Transcribe failed: ${response.status} ${response.text}`);
		}

		return response.json as TranscribeResponse;
	}

	// --- Captures ---

	async createCapture(data: CreateCaptureRequest): Promise<Capture> {
		return this.request<Capture>("POST", "/api/capture", data as unknown as Record<string, unknown>);
	}
}
