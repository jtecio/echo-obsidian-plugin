import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type EchoWebSyncPlugin from "./main";

export class EchoSettingTab extends PluginSettingTab {
	plugin: EchoWebSyncPlugin;

	constructor(app: App, plugin: EchoWebSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Echo Web Sync" });

		// --- Connection ---
		new Setting(containerEl)
			.setName("Server URL")
			.setDesc("Echo Web server address")
			.addText((text) =>
				text
					.setPlaceholder("https://your-echo-server.com")
					.setValue(this.plugin.settings.serverUrl)
					.onChange(async (value) => {
						this.plugin.settings.serverUrl = value;
						this.plugin.api.setServerUrl(value);
						await this.plugin.saveSettings();
					}),
			);

		// --- Login ---
		const loginDiv = containerEl.createDiv({ cls: "echo-settings-login" });

		if (this.plugin.settings.token) {
			loginDiv.createDiv({
				cls: "login-status connected",
				text: `Connected as ${this.plugin.settings.username}`,
			});

			new Setting(loginDiv).addButton((btn) =>
				btn
					.setButtonText("Logout")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.token = "";
						this.plugin.settings.username = "";
						this.plugin.api.setToken("");
						await this.plugin.saveSettings();
						this.display();
					}),
			);
		} else {
			loginDiv.createDiv({
				cls: "login-status disconnected",
				text: "Not connected",
			});

			let loginUser = "";
			let loginPass = "";

			new Setting(loginDiv).setName("Username").addText((text) =>
				text.setPlaceholder("username").onChange((v) => {
					loginUser = v;
				}),
			);

			new Setting(loginDiv).setName("Password").addText((text) =>
				text
					.setPlaceholder("password")
					.onChange((v) => {
						loginPass = v;
					})
					.then((t) => {
						t.inputEl.type = "password";
					}),
			);

			new Setting(loginDiv).addButton((btn) =>
				btn
					.setButtonText("Login")
					.setCta()
					.onClick(async () => {
						if (!loginUser || !loginPass) {
							new Notice("Enter username and password");
							return;
						}
						try {
							const resp = await this.plugin.api.login(
								loginUser,
								loginPass,
							);
							this.plugin.settings.token = resp.token;
							this.plugin.settings.username = resp.username;
							this.plugin.api.setToken(resp.token);
							await this.plugin.saveSettings();
							new Notice(
								`Connected as ${resp.username}`,
							);
							this.display();
						} catch (e) {
							new Notice(
								`Login failed: ${e instanceof Error ? e.message : String(e)}`,
							);
						}
					}),
			);
		}

		// --- Sync Settings ---
		containerEl.createEl("h3", { text: "Sync" });

		new Setting(containerEl)
			.setName("Sync interval")
			.setDesc("Minutes between auto-syncs (1-60)")
			.addSlider((slider) =>
				slider
					.setLimits(1, 60, 1)
					.setValue(this.plugin.settings.syncIntervalMinutes)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.syncIntervalMinutes = value;
						await this.plugin.saveSettings();
						this.plugin.restartAutoSync();
					}),
			);

		new Setting(containerEl)
			.setName("Section header")
			.setDesc(
				"Daily note section to append captures under",
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.sectionHeader)
					.onChange(async (value) => {
						this.plugin.settings.sectionHeader = value;
						await this.plugin.saveSettings();
					}),
			);

		// --- Formatting ---
		containerEl.createEl("h3", { text: "Formatting" });

		new Setting(containerEl)
			.setName("Show audio links")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showAudioLinks)
					.onChange(async (value) => {
						this.plugin.settings.showAudioLinks = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show location")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showLocation)
					.onChange(async (value) => {
						this.plugin.settings.showLocation = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show tags")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showTags)
					.onChange(async (value) => {
						this.plugin.settings.showTags = value;
						await this.plugin.saveSettings();
					}),
			);

		// --- Todos ---
		containerEl.createEl("h3", { text: "Todos" });

		new Setting(containerEl)
			.setName("Sync todos")
			.setDesc("Sync Echo Web todos to today's daily note")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.syncTodos)
					.onChange(async (value) => {
						this.plugin.settings.syncTodos = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Todo section header")
			.setDesc("Section in daily note for todos")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.todoSectionHeader)
					.onChange(async (value) => {
						this.plugin.settings.todoSectionHeader = value;
						await this.plugin.saveSettings();
					}),
			);

		// --- Folders ---
		containerEl.createEl("h3", { text: "Folders" });

		new Setting(containerEl)
			.setName("Daily note folder")
			.setDesc("Base folder for daily notes (year subfolder added automatically)")
			.addText((text) =>
				text
					.setPlaceholder("Journal/Daily")
					.setValue(this.plugin.settings.dailyNoteFolder)
					.onChange(async (value) => {
						this.plugin.settings.dailyNoteFolder = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Meeting notes folder")
			.setDesc("Where to create meeting notes")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.meetingFolder)
					.onChange(async (value) => {
						this.plugin.settings.meetingFolder = value;
						await this.plugin.saveSettings();
					}),
			);

		// --- Status ---
		containerEl.createEl("h3", { text: "Status" });

		const lastSync = this.plugin.settings.lastSyncTimestamp;
		new Setting(containerEl)
			.setName("Last sync")
			.setDesc(lastSync || "Never");

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("Sync Now")
				.setCta()
				.onClick(async () => {
					await this.plugin.syncNow();
					this.display();
				}),
		);

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("Reset sync timestamp")
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.lastSyncTimestamp = "";
					await this.plugin.saveSettings();
					new Notice("Sync timestamp reset - next sync will fetch all captures");
					this.display();
				}),
		);
	}
}
