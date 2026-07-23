import { ProviderConfigBase } from "../registry";

export interface YoudaoProviderConfig extends ProviderConfigBase {
	kind: "youdao";
	/** API key — user obtains from https://mopen.163.com (per SKILL.md). */
	apiKey?: string;
	/** Folder ID under which to save new notes. Empty = "我的资源/收藏笔记". */
	defaultFolderId?: string;
	/** Display name of the chosen folder (for the settings UI). */
	defaultFolderName?: string;
	/** Override CLI binary path. Default: `youdaonote` (resolved via PATH). */
	cliPath?: string;
}

export const DEFAULT_YOUDAO_CONFIG: Omit<YoudaoProviderConfig, "id" | "displayName"> = {
	kind: "youdao",
	enabled: true,
	cliPath: "youdaonote",
};

export const YOUDAO_INSTALL_CMD =
	"curl -fsSL https://artifact.lx.netease.com/download/youdaonote-cli/install.sh | bash -s -- -f -b ~/.local/bin";
export const YOUDAO_INSTALL_GUIDE = "https://note.youdao.com/help-center/cli-install-guide.html";
export const YOUDAO_API_KEY_URL = "https://mopen.163.com";
