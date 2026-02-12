export class AudioRecorder {
	private mediaRecorder: MediaRecorder | null = null;
	private stream: MediaStream | null = null;
	private chunks: Blob[] = [];
	private startTime = 0;

	static isSupported(): boolean {
		return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
	}

	async start(): Promise<void> {
		if (!AudioRecorder.isSupported()) {
			throw new Error("Audio recording not supported on this device");
		}

		this.chunks = [];
		this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

		// Prefer webm, fall back to whatever is available
		const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
			? "audio/webm;codecs=opus"
			: MediaRecorder.isTypeSupported("audio/webm")
				? "audio/webm"
				: undefined;

		this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : {});

		this.mediaRecorder.ondataavailable = (e) => {
			if (e.data.size > 0) {
				this.chunks.push(e.data);
			}
		};

		this.mediaRecorder.start(1000); // Collect in 1s chunks
		this.startTime = Date.now();
	}

	async stop(): Promise<Blob> {
		return new Promise((resolve, reject) => {
			if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
				reject(new Error("Not recording"));
				return;
			}

			this.mediaRecorder.onstop = () => {
				const blob = new Blob(this.chunks, { type: "audio/webm" });
				this.cleanup();
				resolve(blob);
			};

			this.mediaRecorder.stop();
		});
	}

	cancel(): void {
		if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
			this.mediaRecorder.stop();
		}
		this.cleanup();
	}

	getDuration(): number {
		if (this.startTime === 0) return 0;
		return Math.floor((Date.now() - this.startTime) / 1000);
	}

	isRecording(): boolean {
		return this.mediaRecorder?.state === "recording";
	}

	private cleanup(): void {
		if (this.stream) {
			this.stream.getTracks().forEach((t) => t.stop());
			this.stream = null;
		}
		this.mediaRecorder = null;
		this.chunks = [];
		this.startTime = 0;
	}
}
